'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BadgeSummary, CheckInResponse } from 'api-contracts';
import { api, ApiClientError } from '@/lib/api';
import { Alert } from '@/components/feedback/alert';
import { ErrorState, LoadingState } from '@/components/feedback/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClassName } from '@/components/ui/button';
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

export function CheckInScannerView() {
  const [tokenInput, setTokenInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<CheckInResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);

  const [badges, setBadges] = useState<BadgeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [revokingId, setRevokingId] = useState<string | null>(null);

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
    // Keep focus in scanner input for barcode scanner guns
    inputRef.current?.focus();
  }, [lastScanResult, scanError]);

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = tokenInput.trim();
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
      loadBadges();
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
      inputRef.current?.focus();
    }
  };

  const handleRevoke = async (participantId: string, participantName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to revoke the badge credential for ${participantName}?`,
      )
    ) {
      return;
    }

    setRevokingId(participantId);
    try {
      await api.checkin.revokeBadge(participantId);
      loadBadges();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Could not revoke badge.');
    } finally {
      setRevokingId(null);
    }
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
          Scan participant QR tokens using a handheld 2D barcode scanner or manual entry. Tokens are
          high-entropy credentials verified against stored server hashes.
        </p>
      </section>

      {/* Rapid Scanner Station */}
      <section
        className={styles.scannerCard}
        data-state={scannerCardState}
        aria-labelledby="scanner-station-heading"
      >
        <h2 id="scanner-station-heading" className={styles.scannerTitle}>
          <span aria-hidden="true">📷</span>
          <span>Scan Participant QR Badge</span>
        </h2>

        <form onSubmit={handleScanSubmit} className={styles.scannerForm}>
          <div className={styles.scannerInputWrapper}>
            <span className={styles.scannerIcon} aria-hidden="true">
              ⚡
            </span>
            <input
              ref={inputRef}
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Scan or paste 43-character QR token…"
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
    </div>
  );
}
