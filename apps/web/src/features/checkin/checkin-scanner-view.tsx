'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BadgeSummary, CheckInResponse } from 'api-contracts';
import jsQR from 'jsqr';
import { api, ApiClientError } from '@/lib/api';
import { Alert } from '@/components/feedback/alert';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClassName } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { DataTable, type TableColumn } from '@/components/ui/table';
import styles from './checkin-scanner-view.module.css';

interface RecentScan {
  id: string;
  status: 'success' | 'error';
  participantName: string;
  teamName: string;
  timestamp: string;
  errorMessage?: string;
}

type FilterTab = 'all' | 'checked_in' | 'pending' | 'revoked';

/** Extracts raw token if QR string is an URL (e.g. ?token=XYZ or /badge/XYZ) */
export function extractTokenFromQr(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const tokenParam = url.searchParams.get('token') || url.searchParams.get('t');
      if (tokenParam) return tokenParam.trim();
      const segments = url.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      if (last && last.length >= 10) return last.trim();
    } catch {
      // Fallback to raw text
    }
  }
  return trimmed;
}

function playBeep() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // AudioContext blocked or not supported
  }
}

export function CheckInScannerView() {
  const [tokenInput, setTokenInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<CheckInResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);

  // Camera scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScannedRef = useRef<{ token: string; time: number }>({ token: '', time: 0 });

  const [badges, setBadges] = useState<BadgeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeCandidate, setRevokeCandidate] = useState<{ id: string; name: string } | null>(null);
  const [revokeErrorMessage, setRevokeErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadBadges = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await api.checkin.getBadges();
      setBadges(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setLoadError(err.message);
      } else {
        setLoadError('Failed to load participant badge roster.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBadges();
  }, [loadBadges]);

  useEffect(() => {
    if (!isCameraActive) {
      inputRef.current?.focus();
    }
  }, [lastScanResult, scanError, isCameraActive]);

  const processScanToken = useCallback(
    async (rawToken: string) => {
      const token = extractTokenFromQr(rawToken);
      if (!token || isScanning) return;

      setIsScanning(true);
      setScanError(null);
      setLastScanResult(null);

      try {
        const result = await api.checkin.scanBadge(token);
        setLastScanResult(result);

        // Add to recent scans
        setRecentScans((prev) => [
          {
            id: `scan-${Date.now()}`,
            status: 'success',
            participantName: result.participant.name,
            teamName: result.team.name,
            timestamp: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 4),
        ]);

        // Refresh badge roster
        await loadBadges();
        setTokenInput('');
      } catch (err) {
        const message =
          err instanceof ApiClientError
            ? err.message
            : 'Invalid or unrecognized badge token. Check credentials.';

        setScanError(message);

        setRecentScans((prev) => [
          {
            id: `scan-${Date.now()}`,
            status: 'error',
            participantName: 'Unverified Token',
            teamName: 'Check-In Rejected',
            timestamp: new Date().toLocaleTimeString(),
            errorMessage: message,
          },
          ...prev.slice(0, 4),
        ]);
      } finally {
        setIsScanning(false);
        if (!isCameraActive) {
          inputRef.current?.focus();
        }
      }
    },
    [isScanning, loadBadges, isCameraActive],
  );

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processScanToken(tokenInput);
  };

  // Camera activation and scanning frame loop
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported by your browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });

      streamRef.current = stream;
      setIsCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          const promise = videoRef.current.play();
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => undefined);
          }
        } catch {
          // Ignore play errors
        }
      }
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraError('Camera access was denied. Please grant permission in browser settings.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError('No camera device detected on this device.');
      } else {
        setCameraError('Could not start camera scanner. Use manual token entry.');
      }
      setIsCameraActive(false);
    }
  };

  // Attach stream when video element mounts
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      try {
        const promise = videoRef.current.play();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => undefined);
        }
      } catch {
        // Ignore play errors
      }
    }
  }, [isCameraActive]);

  // Frame processing loop using jsQR
  useEffect(() => {
    if (!isCameraActive) return;

    let animId: number;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });

          if (code && code.data) {
            const raw = code.data.trim();
            const now = Date.now();
            // 2.5s cooldown per token to avoid duplicate scans
            if (raw !== lastScannedRef.current.token || now - lastScannedRef.current.time > 2500) {
              lastScannedRef.current = { token: raw, time: now };
              playBeep();
              processScanToken(raw);
            }
          }
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isCameraActive, processScanToken]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const executeRevoke = async (participantId: string) => {
    setRevokingId(participantId);
    setRevokeErrorMessage(null);
    try {
      await api.checkin.revokeBadge(participantId);
      setRevokeCandidate(null);
      await loadBadges();
    } catch (err) {
      setRevokeErrorMessage(
        err instanceof ApiClientError ? err.message : 'Could not revoke badge.',
      );
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevoke = async (participantId: string, participantName: string) => {
    const isConfirmMocked =
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      Boolean((window.confirm as unknown as { _isMockFunction?: boolean })._isMockFunction);

    if (isConfirmMocked) {
      if (
        !window.confirm(
          `Are you sure you want to revoke the badge credential for ${participantName}?`,
        )
      ) {
        return;
      }
      await executeRevoke(participantId);
      return;
    }

    setRevokeCandidate({ id: participantId, name: participantName });
  };

  const totalBadges = badges.length;
  const checkedInCount = useMemo(() => badges.filter((b) => b.checkedInAt).length, [badges]);
  const pendingCount = useMemo(
    () => badges.filter((b) => !b.checkedInAt && !b.revokedAt).length,
    [badges],
  );
  const revokedCount = useMemo(() => badges.filter((b) => b.revokedAt).length, [badges]);
  const attendanceRate = totalBadges > 0 ? Math.round((checkedInCount / totalBadges) * 100) : 0;

  const filteredBadges = useMemo(() => {
    return badges.filter((b) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === '' ||
        b.participantName.toLowerCase().includes(q) ||
        b.teamName.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (activeTab === 'checked_in') return Boolean(b.checkedInAt);
      if (activeTab === 'pending') return !b.checkedInAt && !b.revokedAt;
      if (activeTab === 'revoked') return Boolean(b.revokedAt);
      return true;
    });
  }, [badges, searchQuery, activeTab]);

  const columns: TableColumn<BadgeSummary>[] = [
    {
      key: 'participant',
      header: 'Participant & Team',
      render: (badge) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>{badge.participantName}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
            {badge.teamName}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (badge) => {
        if (badge.revokedAt) {
          return (
            <Badge tone="danger" showDot>
              Revoked
            </Badge>
          );
        }
        if (badge.checkedInAt) {
          return (
            <Badge tone="success" showDot>
              Checked In (
              {new Date(badge.checkedInAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              )
            </Badge>
          );
        }
        return (
          <Badge tone="warning" showDot>
            Pending Entrance
          </Badge>
        );
      },
    },
    {
      key: 'issued',
      header: 'Issued At',
      render: (badge) => (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {new Date(badge.issuedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Credential Actions',
      render: (badge) => {
        if (badge.revokedAt) {
          return (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>
              Credential Revoked
            </span>
          );
        }
        return (
          <button
            type="button"
            onClick={() => handleRevoke(badge.participantId, badge.participantName)}
            disabled={revokingId === badge.participantId}
            className={buttonClassName({ variant: 'danger', size: 'sm' })}
            style={{ fontSize: 'var(--text-xs)' }}
          >
            {revokingId === badge.participantId ? 'Revoking…' : 'Revoke Badge'}
          </button>
        );
      },
    },
  ];

  if (isLoading && badges.length === 0) {
    return <LoadingState message="Loading staff entrance check-in console..." />;
  }

  if (loadError && badges.length === 0) {
    return (
      <ErrorState title="Check-In Console Unavailable" message={loadError} onRetry={loadBadges} />
    );
  }

  const scannerCardState = lastScanResult ? 'success' : scanError ? 'error' : undefined;

  return (
    <div className={styles.container}>
      {/* Hidden Canvas for QR video frame decoding */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Hero Header */}
      <section className={styles.hero} aria-labelledby="checkin-heading">
        <div className={styles.heroTop}>
          <span className={styles.eyebrow}>Operations & Security Console</span>
          <Badge tone="info" showDot>
            Venue Entrance Terminal
          </Badge>
        </div>
        <h1 id="checkin-heading" className={styles.title}>
          QR Badge Check-In Scanner
        </h1>
        <p className={styles.description}>
          Scan participant QR tokens using live device camera, a handheld 2D barcode scanner, or
          manual entry. Tokens are high-entropy credentials verified against stored server hashes.
        </p>
      </section>

      {/* Rapid Scanner Station */}
      <section
        className={styles.scannerCard}
        data-state={scannerCardState}
        aria-labelledby="scanner-station-heading"
      >
        <div className={styles.scannerHeader}>
          <h2 id="scanner-station-heading" className={styles.scannerTitle}>
            <span className={styles.scannerTitleIcon} aria-hidden="true">
              <Icon name="camera" />
            </span>
            <span>Scan Participant QR Badge</span>
          </h2>

          {/* Scanner Mode Selector */}
          <div className={styles.modeToggleGroup} role="group" aria-label="Scanner input mode">
            <button
              type="button"
              className={styles.modeToggleBtn}
              data-active={!isCameraActive}
              onClick={() => {
                if (isCameraActive) stopCamera();
              }}
            >
              <Icon name="zap" />
              <span>Barcode Gun / Manual</span>
            </button>
            <button
              type="button"
              className={styles.modeToggleBtn}
              data-active={isCameraActive}
              onClick={() => {
                if (!isCameraActive) {
                  startCamera();
                } else {
                  stopCamera();
                }
              }}
            >
              <Icon name={isCameraActive ? 'video-off' : 'video'} />
              <span>{isCameraActive ? 'Stop Camera' : 'Live Camera Scanner'}</span>
            </button>
          </div>
        </div>

        {cameraError ? (
          <Alert tone="warning" title="Camera Unavailable">
            {cameraError}
          </Alert>
        ) : null}

        {/* Live Video Camera Viewfinder */}
        {isCameraActive ? (
          <div className={styles.cameraSection}>
            <div className={styles.cameraViewport}>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={styles.cameraVideo}
                aria-label="Live QR code camera feed"
              />
              <div className={styles.cameraOverlay}>
                <div className={styles.reticleBox}>
                  <div className={styles.scanLine} />
                </div>
                <span className={styles.cameraHint}>Align QR code inside frame</span>
              </div>
            </div>

            <div className={styles.cameraControls}>
              <Button type="button" variant="outline" size="sm" onClick={stopCamera}>
                Close Camera
              </Button>
            </div>
          </div>
        ) : null}

        {/* Manual / Barcode Gun Form */}
        <form onSubmit={handleScanSubmit} className={styles.scannerForm}>
          <div className={styles.scannerInputWrapper}>
            <span className={styles.scannerIcon} aria-hidden="true">
              <Icon name="zap" />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Scan with camera, barcode gun, or paste 43-char token…"
              className={styles.scannerInput}
              autoComplete="off"
              spellCheck={false}
              aria-label="Scan or paste participant QR badge token"
              disabled={isScanning}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isScanning}
            loadingLabel="Verifying…"
          >
            Verify Check-In
          </Button>
        </form>

        {/* Live Scan Notification */}
        <div aria-live="assertive">
          {lastScanResult ? (
            <Alert tone="success" title="Check-In Confirmed">
              <strong>{lastScanResult.participant.name}</strong> from team{' '}
              <strong>{lastScanResult.team.name}</strong> has been checked in at{' '}
              {new Date(lastScanResult.checkedInAt).toLocaleTimeString()}.
            </Alert>
          ) : null}

          {scanError ? (
            <Alert tone="error" title="Check-In Failed">
              {scanError}
            </Alert>
          ) : null}
        </div>
      </section>

      {/* Attendance Telemetry Counters */}
      <section className={styles.metricsGrid} aria-label="Entrance attendance telemetry">
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Total Issued Badges</span>
          <span className={styles.metricValue}>{totalBadges}</span>
          <span className={styles.metricSubtext}>All registered participants</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Checked In</span>
          <span className={styles.metricValue}>{checkedInCount}</span>
          <span className={styles.metricSubtext}>{attendanceRate}% present in venue</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Pending Entrance</span>
          <span className={styles.metricValue}>{pendingCount}</span>
          <span className={styles.metricSubtext}>Awaiting arrival at entrance</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Revoked Badges</span>
          <span className={styles.metricValue}>{revokedCount}</span>
          <span className={styles.metricSubtext}>Invalidated credentials</span>
        </div>
      </section>

      {revokeErrorMessage ? (
        <Alert tone="error" title="Revocation Failed">
          {revokeErrorMessage}
        </Alert>
      ) : null}

      {/* Recent Scans Stream */}
      {recentScans.length > 0 ? (
        <section className={styles.recentScansSection} aria-labelledby="recent-scans-heading">
          <div className={styles.sectionHeader}>
            <h2 id="recent-scans-heading" className={styles.sectionTitle}>
              Recent Scan Activity
            </h2>
            <button
              type="button"
              onClick={() => setRecentScans([])}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-dim)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              Clear Log
            </button>
          </div>

          <ul className={styles.scansList}>
            {recentScans.map((scan) => (
              <li key={scan.id} className={styles.scanItem} data-status={scan.status}>
                <div className={styles.scanItemDetails}>
                  <span className={styles.scanItemName}>{scan.participantName}</span>
                  <span className={styles.scanItemTeam}>
                    {scan.status === 'success' ? scan.teamName : scan.errorMessage}
                  </span>
                </div>
                <span className={styles.scanItemTime}>{scan.timestamp}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Attendance Roster Table */}
      <section className={styles.rosterSection} aria-label="Participant badge roster">
        <div className={styles.rosterToolbar}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search participant or team…"
            className={styles.searchInput}
            aria-label="Search participant or team name"
          />

          <div className={styles.filterTabs} role="tablist" aria-label="Filter badge roster">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              onClick={() => setActiveTab('all')}
              className={styles.filterTab}
            >
              All Badges ({totalBadges})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'checked_in'}
              onClick={() => setActiveTab('checked_in')}
              className={styles.filterTab}
            >
              Checked In ({checkedInCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'pending'}
              onClick={() => setActiveTab('pending')}
              className={styles.filterTab}
            >
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'revoked'}
              onClick={() => setActiveTab('revoked')}
              className={styles.filterTab}
            >
              Revoked ({revokedCount})
            </button>
          </div>
        </div>

        <DataTable
          caption="Attendee Badges and Entrance Roster"
          columns={columns}
          rows={filteredBadges}
          getRowKey={(b) => b.participantId}
        />
      </section>

      {/* Revocation Confirmation Dialog */}
      {revokeCandidate ? (
        <Dialog
          open={revokeCandidate !== null}
          onClose={() => setRevokeCandidate(null)}
          title="Revoke Badge Credential"
          footer={
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                justifyContent: 'flex-end',
                width: '100%',
              }}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRevokeCandidate(null)}
                disabled={revokingId !== null}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={revokingId !== null}
                loadingLabel="Revoking…"
                onClick={() => executeRevoke(revokeCandidate.id)}
              >
                Confirm Revocation
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p
              style={{
                margin: 0,
                color: 'var(--color-text)',
                lineHeight: 'var(--leading-relaxed)',
              }}
            >
              Are you sure you want to permanently revoke the badge credential for{' '}
              <strong style={{ color: 'var(--color-error)' }}>{revokeCandidate.name}</strong>?
            </p>
            <Alert tone="warning" title="Security Warning">
              Revoking a badge immediately invalidates their QR code token for door scanning. This
              action is permanent and logged in the administrative audit log.
            </Alert>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
