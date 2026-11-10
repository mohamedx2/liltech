import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/feedback/alert';
import type { BadgePassResponse } from '@/lib/api/contracts/pending';
import { getTrackLabel } from '@/lib/format';
import styles from './qr-pass-card.module.css';

export interface QrPassCardProps {
  badge: BadgePassResponse;
  className?: string;
}

export function QrPassCard({ badge, className = '' }: QrPassCardProps) {
  const handleDownload = () => {
    if (!badge.qrData) return;
    const link = document.createElement('a');
    link.href = badge.qrData;
    link.download = `liltech-badge-${badge.participantName.toLowerCase().replace(/\s+/g, '-')}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card surface="raised" className={[styles.card, className].filter(Boolean).join(' ')}>
      <CardHeader>
        <div className={styles.headerRow}>
          <div>
            <CardTitle as="h2">Personal Entrance Pass</CardTitle>
            <CardDescription>Scan at the venue entrance for team check-in</CardDescription>
          </div>
          {badge.track && <Badge tone="info">{getTrackLabel(badge.track)}</Badge>}
        </div>
      </CardHeader>

      <CardContent className={styles.content}>
        <div className={styles.badgePreviewWrapper}>
          <div className={styles.qrContainer}>
            {badge.qrData ? (
              <img
                src={badge.qrData}
                alt={`Personal entrance QR code for ${badge.participantName}`}
                className={styles.qrImage}
                width={180}
                height={180}
              />
            ) : (
              <div className={styles.tokenBox}>
                <span className={styles.tokenLabel}>Digital Pass Token</span>
                <code className={styles.tokenCode}>{badge.qrToken}</code>
              </div>
            )}
          </div>

          <div className={styles.metaInfo}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Participant</span>
              <span className={styles.metaValue}>{badge.participantName}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Team</span>
              <span className={styles.metaValue}>{badge.teamName}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Verification Status</span>
              <span className={styles.metaValue}>
                <Badge tone="success" showDot>
                  Issued &amp; Active
                </Badge>
              </span>
            </div>
          </div>
        </div>

        <Alert tone="warning" title="Confidential Credential">
          Do not share this pass or token with other teams. Your pass can only be scanned once at
          the entrance.
        </Alert>
      </CardContent>

      <CardFooter className={styles.footer}>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          Save Badge to Device
        </Button>
      </CardFooter>
    </Card>
  );
}
