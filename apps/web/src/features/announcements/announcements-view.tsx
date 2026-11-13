'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { AnnouncementItem, AnnouncementPriority } from '@/lib/api/contracts/pending';
import { formatUtcTimestamp } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/state-panel';
import styles from './announcements-view.module.css';

type PriorityFilter = AnnouncementPriority | 'all';

export function AnnouncementsView() {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [filterPriority, setFilterPriority] = useState<PriorityFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAnnouncements = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const data = await api.announcements.getAnnouncements();
      setAnnouncements(data.items);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load announcements feed.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();

    // REST Polling every 30 seconds for live updates (no WebSockets needed yet)
    const interval = setInterval(() => {
      loadAnnouncements(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [loadAnnouncements]);

  const filteredItems = announcements.filter((item) => {
    if (filterPriority === 'all') return true;
    return item.priority === filterPriority;
  });

  const getPriorityBadgeTone = (priority: AnnouncementPriority) => {
    switch (priority) {
      case 'urgent':
        return 'danger';
      case 'broadcast':
        return 'info';
      case 'normal':
      default:
        return 'neutral';
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading live announcements feed..." />;
  }

  if (errorMessage && announcements.length === 0) {
    return (
      <ErrorState
        title="Announcements Unavailable"
        message={errorMessage}
        onRetry={() => {
          loadAnnouncements();
        }}
      />
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <span className={styles.subHeading}>Broadcast Central</span>
          <h1 className={styles.title}>Live Announcements</h1>
          <p className={styles.description}>
            Important updates, schedule reminders, and mentor notices broadcasted by event
            organizers.
          </p>
        </div>

        <div className={styles.controlsRow}>
          <div className={styles.filterGroup}>
            <button
              type="button"
              className={[styles.filterButton, filterPriority === 'all' && styles.active]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setFilterPriority('all')}
            >
              All ({announcements.length})
            </button>
            <button
              type="button"
              className={[styles.filterButton, filterPriority === 'urgent' && styles.active]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setFilterPriority('urgent')}
            >
              Urgent
            </button>
            <button
              type="button"
              className={[styles.filterButton, filterPriority === 'broadcast' && styles.active]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setFilterPriority('broadcast')}
            >
              Broadcasts
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadAnnouncements(false);
            }}
            loading={isRefreshing}
          >
            Refresh Feed
          </Button>
        </div>
      </header>

      {filteredItems.length === 0 ? (
        <EmptyState
          title="No Announcements Yet"
          message={
            filterPriority === 'all'
              ? 'Organizers have not posted any announcements yet. Check back soon!'
              : `No announcements match the "${filterPriority}" filter.`
          }
        />
      ) : (
        <div className={styles.feedList} role="feed" aria-label="Announcements Stream">
          {filteredItems.map((item) => (
            <article key={item.id} className={styles.announcementArticle}>
              <Card surface="default" variant="row" className={styles.announcementCard}>
                <CardHeader>
                  <div className={styles.cardHeaderRow}>
                    <div className={styles.titleBlock}>
                      <Badge tone={getPriorityBadgeTone(item.priority)} showDot>
                        {item.priority.toUpperCase()}
                      </Badge>
                      <CardTitle as="h2">{item.title}</CardTitle>
                    </div>
                    <time dateTime={item.createdAt} className={styles.timestamp}>
                      {formatUtcTimestamp(item.createdAt)}
                    </time>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className={styles.bodyContent}>{item.content}</p>
                </CardContent>
              </Card>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
