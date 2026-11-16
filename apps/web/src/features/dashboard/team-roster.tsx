import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { ParticipantProfile } from '@/lib/api/contracts/pending';
import styles from './team-roster.module.css';

export interface TeamRosterProps {
  members: ParticipantProfile[];
  className?: string;
}

export function TeamRoster({ members, className = '' }: TeamRosterProps) {
  return (
    <Card surface="default" className={[styles.card, className].filter(Boolean).join(' ')}>
      <CardHeader>
        <CardTitle as="h2">Team Roster ({members.length} Members)</CardTitle>
        <CardDescription>Eligible team participants and door check-in status</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          caption="Participant directory for this team"
          columns={[
            {
              key: 'fullName',
              header: 'Full Name',
              render: (member) => <strong>{member.fullName}</strong>,
            },
            { key: 'email', header: 'Email', render: (member) => member.email ?? '—' },
            {
              key: 'color',
              header: 'Badge Color',
              render: (member) =>
                member.color ? member.color.charAt(0).toUpperCase() + member.color.slice(1) : '—',
            },
            {
              key: 'roleInTeam',
              header: 'Role',
              render: (member) => (
                <Badge tone={member.roleInTeam === 'leader' ? 'info' : 'neutral'}>
                  {member.roleInTeam === 'leader' ? 'Team Leader' : 'Member'}
                </Badge>
              ),
            },
            {
              key: 'isCheckedIn',
              header: 'Entrance Status',
              render: (member) => (
                <Badge tone={member.isCheckedIn ? 'success' : 'warning'} showDot>
                  {member.isCheckedIn ? 'Checked In' : 'Pending Check-In'}
                </Badge>
              ),
            },
          ]}
          rows={members}
          getRowKey={(member) => member.id}
        />
      </CardContent>
    </Card>
  );
}
