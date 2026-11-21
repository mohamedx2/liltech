import { TEAM_MEMBERS_TOTAL_MAX, TEAM_MEMBERS_TOTAL_MIN } from 'api-contracts';

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
});

const json = (schema: object, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const uuidPathParam = (name: string) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
});

const badgeColor = { type: 'string', enum: ['blue', 'red', 'yellow', 'green'], nullable: true };

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'LilTech 2026 Platform API',
    version: '0.1.0',
    description:
      'Backend API powering LilTech 2026 (November 21–22, 2026 at Campus EPI, Sousse, Tunisia). Organized by GDG on Campus EPI and ISITCom Google Club.',
    contact: {
      name: 'LilTech Organizing Committee',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'API Base Path',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Opaque DB Token',
        description:
          'Provide the 43-character session bearer token received from POST /auth/login.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                example: 'NOT_FOUND',
                enum: [
                  'CONFLICT',
                  'CTF_NOT_SOLVED',
                  'FORBIDDEN',
                  'INTERNAL',
                  'NOT_FOUND',
                  'RATE_LIMITED',
                  'UNAUTHORIZED',
                  'VALIDATION_ERROR',
                ],
              },
              message: { type: 'string', example: 'The requested resource was not found.' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', example: 'teamName' },
                    message: {
                      type: 'string',
                      example: 'String must contain at least 3 character(s)',
                    },
                  },
                },
              },
            },
          },
        },
      },
      HealthResponse: {
        type: 'object',
        required: ['status', 'uptimeSeconds', 'timestamp', 'database'],
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded'], example: 'ok' },
          uptimeSeconds: { type: 'number', example: 142 },
          timestamp: { type: 'string', format: 'date-time', example: '2026-11-21T18:00:00.000Z' },
          database: {
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string', enum: ['up', 'down'], example: 'up' },
              latencyMs: { type: 'number', example: 2 },
            },
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'leader@quantumcoders.tn' },
          password: { type: 'string', format: 'password', example: 'Sup3rS3curePassw0rd!' },
        },
      },
      LoginResponse: {
        type: 'object',
        required: ['account', 'token', 'expiresAt'],
        properties: {
          account: {
            type: 'object',
            required: ['id', 'role', 'name', 'email'],
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
                example: '00000000-0000-4000-8000-000000000001',
              },
              role: { type: 'string', enum: ['team', 'jury', 'admin'], example: 'team' },
              name: { type: 'string', example: 'Sarra Ben Ahmed' },
              email: { type: 'string', format: 'email', example: 'leader@quantumcoders.tn' },
            },
          },
          token: { type: 'string', example: '43-char-high-entropy-session-token-value-here' },
          expiresAt: { type: 'string', format: 'date-time', example: '2026-11-22T18:00:00.000Z' },
        },
      },
      Account: {
        type: 'object',
        required: ['id', 'role', 'name', 'email'],
        properties: {
          id: { type: 'string', format: 'uuid', example: '00000000-0000-4000-8000-000000000001' },
          role: { type: 'string', enum: ['team', 'jury', 'admin'], example: 'admin' },
          name: { type: 'string', example: 'Admin Organizer' },
          email: { type: 'string', format: 'email', example: 'admin@liltech.tn' },
        },
      },
      EventStateResponse: {
        type: 'object',
        required: ['phase', 'phaseChangedAt', 'serverTime'],
        properties: {
          phase: {
            type: 'string',
            enum: ['registration', 'checkin', 'live', 'submissions_closed', 'pitching', 'results'],
            example: 'checkin',
          },
          phaseChangedAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-11-21T18:00:00.000Z',
          },
          serverTime: { type: 'string', format: 'date-time', example: '2026-11-21T18:30:00.000Z' },
        },
      },
      UpdateEventStateRequest: {
        type: 'object',
        required: ['phase'],
        properties: {
          phase: {
            type: 'string',
            enum: ['registration', 'checkin', 'live', 'submissions_closed', 'pitching', 'results'],
            example: 'live',
          },
        },
      },
      CreateTeamRequest: {
        type: 'object',
        required: ['teamName', 'leader', 'members'],
        properties: {
          teamName: { type: 'string', minLength: 3, maxLength: 60, example: 'Quantum Coders' },
          leader: {
            type: 'object',
            required: ['name', 'email', 'university', 'phone', 'password'],
            properties: {
              name: { type: 'string', example: 'Sarra Ben Ahmed' },
              email: { type: 'string', format: 'email', example: 'leader@quantumcoders.tn' },
              university: { type: 'string', minLength: 2, maxLength: 120, example: 'ISITCom' },
              phone: {
                type: 'string',
                maxLength: 20,
                example: '+216 20 123 456',
                description:
                  'Mobile number: digits with optional +, spaces, dashes or parentheses; 8–15 digits.',
              },
              password: { type: 'string', minLength: 12, example: 'SuperSecureSecret123!' },
            },
          },
          members: {
            type: 'array',
            minItems: TEAM_MEMBERS_TOTAL_MIN - 1,
            maxItems: TEAM_MEMBERS_TOTAL_MAX - 1,
            items: {
              type: 'object',
              required: ['name', 'email', 'university', 'phone'],
              properties: {
                name: { type: 'string', example: 'Karim Mansour' },
                email: { type: 'string', format: 'email', example: 'karim@quantumcoders.tn' },
                university: { type: 'string', minLength: 2, maxLength: 120, example: 'ISITCom' },
                phone: {
                  type: 'string',
                  maxLength: 20,
                  example: '+216 20 123 456',
                  description:
                    'Mobile number: digits with optional +, spaces, dashes or parentheses; 8–15 digits.',
                },
              },
            },
          },
        },
      },
      IssueBadgeResponse: {
        type: 'object',
        required: ['participantId', 'participantName', 'token', 'issuedAt'],
        properties: {
          participantId: { type: 'string', format: 'uuid' },
          participantName: { type: 'string', example: 'Sarra Ben Ahmed' },
          token: { type: 'string', example: '43-char-raw-badge-credential-token-shown-once' },
          issuedAt: { type: 'string', format: 'date-time' },
        },
      },
      TeamResponse: {
        type: 'object',
        required: ['id', 'name', 'progressState', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Quantum Coders' },
          progressState: {
            type: 'string',
            enum: [
              'registered',
              'checked_in',
              'ctf_unlocked',
              'ctf_solved',
              'challenge_unlocked',
              'submitted',
            ],
            example: 'registered',
          },
          createdAt: { type: 'string', format: 'date-time' },
          leader: {
            type: 'object',
            required: ['id', 'name', 'email'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
          },
          participants: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'name'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                email: { type: 'string', nullable: true },
                checkedInAt: { type: 'string', format: 'date-time', nullable: true },
              },
            },
          },
        },
      },
      ScanCheckInRequest: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', example: '43-char-base64url-qr-badge-token' },
        },
      },
      CheckInResponse: {
        type: 'object',
        required: ['participant', 'team', 'checkedInAt'],
        properties: {
          participant: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string', example: 'Sarra Ben Ahmed' },
            },
          },
          team: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string', example: 'Quantum Coders' },
            },
          },
          checkedInAt: { type: 'string', format: 'date-time', example: '2026-11-21T18:15:00.000Z' },
        },
      },
      RevokeBadgeRequest: {
        type: 'object',
        required: ['participantId'],
        properties: {
          participantId: { type: 'string', format: 'uuid' },
        },
      },
      BadgeSummary: {
        type: 'object',
        required: ['participantId', 'participantName', 'teamName', 'issuedAt'],
        properties: {
          participantId: { type: 'string', format: 'uuid' },
          participantName: { type: 'string', example: 'Sarra Ben Ahmed' },
          teamName: { type: 'string', example: 'Quantum Coders' },
          issuedAt: { type: 'string', format: 'date-time' },
          revokedAt: { type: 'string', format: 'date-time', nullable: true },
          checkedInAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Announcement: {
        type: 'object',
        required: ['id', 'body', 'publishedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          body: {
            type: 'string',
            example: 'Mini-CTF is now live! Solve the flag challenge to unlock your track.',
          },
          publishedAt: { type: 'string', format: 'date-time' },
          authorName: { type: 'string', nullable: true, example: 'Admin Organizer' },
        },
      },
      CreateAnnouncementRequest: {
        type: 'object',
        required: ['body'],
        properties: {
          body: {
            type: 'string',
            minLength: 1,
            maxLength: 500,
            example: 'Dinner is served at the main hall!',
          },
        },
      },
      JuryAccount: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', nullable: true, description: 'Readable by admins only' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ResendBadgeEmailResponse: {
        type: 'object',
        properties: {
          participantId: { type: 'string', format: 'uuid' },
          emailStatus: { type: 'string', enum: ['pending', 'sent', 'failed'] },
          emailLastSentAt: { type: 'string', format: 'date-time' },
          emailResendAvailableAt: { type: 'string', format: 'date-time' },
        },
      },
      AuditLogEntry: {
        type: 'object',
        required: ['id', 'action', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          action: { type: 'string', example: 'event.phase_changed' },
          actorName: { type: 'string', nullable: true, example: 'Admin Organizer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  tags: [
    { name: 'Health', description: 'Application and database connectivity probes' },
    { name: 'Auth', description: 'Session creation, credential verification, and account profile' },
    {
      name: 'Event State',
      description: 'Phase lifecycle management and authoritative server clock',
    },
    { name: 'Registration', description: 'Team and participant roster management' },
    { name: 'Check-In', description: 'Entrance gate QR badge verification and badge revocation' },
    { name: 'Announcements', description: 'Live announcements stream and admin broadcaster' },
    { name: 'Admin', description: 'Audit log, team roster, jury accounts and badge emails' },
    { name: 'Challenges', description: 'Two sequential challenges with Mini-CTF early access' },
    { name: 'Team Portal', description: 'The signed-in team members, QR badges and badge emails' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Check API and database health',
        description: 'Returns API uptime and verifies PostgreSQL database connectivity.',
        responses: {
          200: {
            description: 'API and database are healthy',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } },
            },
          },
          503: {
            description: 'API is running but database is unreachable (degraded mode)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in with email and password',
        description:
          'Exchanges email and password for an opaque, server-backed session bearer token. Rate limited to 10 attempts/min per IP.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          400: {
            description: 'Invalid input payload',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          401: {
            description: 'Invalid email or password',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          429: {
            description: 'Too many login attempts',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Log out and invalidate session',
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Session successfully revoked' },
          401: {
            description: 'Unauthenticated or invalid token',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current authenticated account',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Account profile',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Account' } } },
          },
          401: {
            description: 'Unauthenticated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/event-state': {
      get: {
        tags: ['Event State'],
        summary: 'Get current event phase and server time',
        description: 'Authoritative server clock and active phase. Publicly accessible.',
        responses: {
          200: {
            description: 'Current phase and server time',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/EventStateResponse' } },
            },
          },
        },
      },
      post: {
        tags: ['Event State'],
        summary: 'Transition event phase (Admin only)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateEventStateRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Event phase updated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/EventStateResponse' } },
            },
          },
          400: {
            description: 'Invalid input payload',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          401: {
            description: 'Unauthenticated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          403: {
            description: 'Requires admin role',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          409: {
            description: 'Phase transition conflict (already in requested phase)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/registration/teams': {
      post: {
        tags: ['Registration'],
        summary: 'Register a new team (4–7 members)',
        description:
          'Creates team leader account, registers participants, and issues high-entropy QR badge tokens.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateTeamRequest' } },
          },
        },
        responses: {
          201: {
            description: 'Team registered successfully with issued badges',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/TeamResponse' },
                    {
                      type: 'object',
                      properties: {
                        badges: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/IssueBadgeResponse' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: {
            description: 'Validation error (roster size, password length, etc.)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          409: {
            description: 'Duplicate team name or leader email',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/registration/teams/me': {
      get: {
        tags: ['Registration'],
        summary: 'Get team details for current logged-in leader',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Team details and member check-in statuses',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/TeamResponse' } },
            },
          },
          401: {
            description: 'Unauthenticated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          403: {
            description: 'Requires team role',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          404: {
            description: 'No team found for account',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/checkin/scan': {
      post: {
        tags: ['Check-In'],
        summary: 'Scan participant QR badge token (Admin/Staff only)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ScanCheckInRequest' } },
          },
        },
        responses: {
          200: {
            description: 'Check-in confirmed',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CheckInResponse' } },
            },
          },
          400: {
            description: 'Invalid token format',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          401: {
            description: 'Unauthenticated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          403: {
            description: 'Requires admin role or credential was revoked',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          404: {
            description: 'Unrecognized badge token',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          409: {
            description: 'Participant has already checked in',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/checkin/revoke': {
      post: {
        tags: ['Check-In'],
        summary: 'Revoke participant QR credential (Admin only)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RevokeBadgeRequest' } },
          },
        },
        responses: {
          200: {
            description: 'Badge successfully revoked',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    participantId: { type: 'string', format: 'uuid' },
                    revokedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          401: {
            description: 'Unauthenticated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          403: {
            description: 'Requires admin role',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          404: {
            description: 'Participant or badge not found',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/checkin/badges': {
      get: {
        tags: ['Check-In'],
        summary: 'List all issued badges with check-in status (Admin only)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Badge roster list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/BadgeSummary' },
                    },
                    total: { type: 'number' },
                  },
                },
              },
            },
          },
          401: {
            description: 'Unauthenticated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          403: {
            description: 'Requires admin role',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/announcements': {
      get: {
        tags: ['Announcements'],
        summary: 'List recent event announcements',
        description: 'Accessible to any authenticated user (team, jury, admin).',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Recent announcements feed, newest first',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Announcement' },
                    },
                    total: { type: 'number' },
                  },
                },
              },
            },
          },
          401: {
            description: 'Unauthenticated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
      post: {
        tags: ['Announcements'],
        summary: 'Publish a new announcement (Admin only)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateAnnouncementRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Announcement published',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Announcement' } },
            },
          },
          400: {
            description: 'Invalid input payload',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          401: {
            description: 'Unauthenticated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          403: {
            description: 'Requires admin role',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/admin/audit-log': {
      get: {
        tags: ['Admin'],
        summary: 'List administrative audit logs (Admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 },
          },
          {
            name: 'offset',
            in: 'query',
            schema: { type: 'integer', default: 0, minimum: 0 },
          },
          {
            name: 'action',
            in: 'query',
            description: 'Only actions starting with this prefix, e.g. `team.`',
            schema: { type: 'string', pattern: '^[a-z_.]+$' },
          },
        ],
        responses: {
          200: {
            description: 'Audit log entries',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/AuditLogEntry' },
                    },
                    total: { type: 'number' },
                  },
                },
              },
            },
          },
          401: {
            description: 'Unauthenticated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          403: {
            description: 'Requires admin role',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/admin/teams': {
      get: {
        tags: ['Admin'],
        summary: 'Team roster with contact, badge, check-in and Mini-CTF state (Admin only)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Complete registered teams list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        description:
                          'AdminTeam (adminTeamSchema): standing, progress, leader login, participants with email, university, phone, color, check-in and badge state, Mini-CTF solves',
                      },
                    },
                    total: { type: 'number' },
                  },
                },
              },
            },
          },
          401: {
            description: 'Unauthenticated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          403: {
            description: 'Requires admin role',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/admin/jury': {
      get: {
        tags: ['Admin'],
        summary: 'List jury accounts with their passwords (Admin only)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json(
            {
              type: 'object',
              properties: {
                items: { type: 'array', items: ref('JuryAccount') },
                total: { type: 'number' },
              },
            },
            'Jury accounts roster',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
        },
      },
      post: {
        tags: ['Admin'],
        summary: 'Create a jury account (Admin only, audited)',
        description: 'Omit password to let the server generate a 16-character password.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email'],
                additionalProperties: false,
                properties: {
                  name: { type: 'string', maxLength: 100 },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 12, maxLength: 256 },
                },
              },
            },
          },
        },
        responses: {
          201: json(ref('JuryAccount'), 'Created jury account, including its password'),
          400: errorResponse('Invalid payload'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          409: errorResponse('Email already used by another account'),
        },
      },
    },
    '/jury/overview': {
      get: {
        tags: ['Jury'],
        summary: 'Assigned challenge, progress and scoring window (Jury only)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json({ type: 'object', description: 'juryOverviewResponseSchema' }, 'Overview'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires jury role, or JURY_NOT_ASSIGNED'),
        },
      },
    },
    '/jury/teams': {
      get: {
        tags: ['Jury'],
        summary: 'Teams to score on my challenge (Jury only)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json({ type: 'array', description: 'juryTeamItemSchema[]' }, 'Teams'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires jury role, or JURY_NOT_ASSIGNED'),
        },
      },
    },
    '/jury/evaluation': {
      get: {
        tags: ['Jury'],
        summary: 'One team, its latest submission and my scores (Jury only)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'teamId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: json(
            { type: 'object', description: 'juryTeamEvaluationResponseSchema' },
            'Evaluation',
          ),
          400: errorResponse('Invalid team id'),
          403: errorResponse('Requires jury role, or JURY_NOT_ASSIGNED'),
          404: errorResponse('Team not part of the evaluation'),
        },
      },
      post: {
        tags: ['Jury'],
        summary: 'Save my scores for a team (Jury only, scoring window, audited)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'teamId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'submitEvaluationRequestSchema (integers 0–25)',
              },
            },
          },
        },
        responses: {
          200: json({ type: 'object', description: 'submitEvaluationResponseSchema' }, 'Saved'),
          400: errorResponse('Invalid scores'),
          403: errorResponse('SCORING_CLOSED, JURY_NOT_ASSIGNED or wrong role'),
          404: errorResponse('Team not part of the evaluation'),
        },
      },
    },
    '/admin/jury/{id}': {
      patch: {
        tags: ['Admin'],
        summary: 'Update a jury account (Admin only, audited)',
        description: 'A new password ends every existing session of that juror.',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('id')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                minProperties: 1,
                additionalProperties: false,
                properties: {
                  name: { type: 'string', maxLength: 100 },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 12, maxLength: 256 },
                },
              },
            },
          },
        },
        responses: {
          200: json(ref('JuryAccount'), 'Updated jury account'),
          400: errorResponse('Invalid payload'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('No jury account with this id'),
          409: errorResponse('Email already used by another account'),
        },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Delete a jury account and its sessions (Admin only, audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('id')],
        responses: {
          204: { description: 'Deleted' },
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('No jury account with this id'),
        },
      },
    },
    '/admin/participants/{participantId}/resend-badge-email': {
      post: {
        tags: ['Admin'],
        summary: 'Resend a badge email without the hourly limit (Admin only, audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('participantId')],
        responses: {
          200: json(ref('ResendBadgeEmailResponse'), 'Delivery attempted'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown participant'),
          409: errorResponse('Badge revoked or no email on file'),
        },
      },
    },
    '/participants/team': {
      get: {
        tags: ['Team Portal'],
        summary: 'The signed-in team, its members and their badge colors (Team only)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json(
            {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                progress: { type: 'string', example: 'registered' },
                isCheckedIn: { type: 'boolean' },
                members: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      teamId: { type: 'string', format: 'uuid' },
                      fullName: { type: 'string' },
                      email: { type: 'string', nullable: true },
                      roleInTeam: { type: 'string', enum: ['leader', 'member'] },
                      color: badgeColor,
                      isCheckedIn: { type: 'boolean' },
                    },
                  },
                },
              },
            },
            'Team summary',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires team role'),
        },
      },
    },
    '/participants/badge': {
      get: {
        tags: ['Team Portal'],
        summary: 'Every member QR badge of the signed-in team (Team only)',
        description:
          'Tokens are decrypted only for the caller team. Revoked badges and badges issued before retrievable storage have a null token.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json(
            {
              type: 'object',
              properties: {
                teamId: { type: 'string', format: 'uuid' },
                teamName: { type: 'string' },
                badges: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      participantId: { type: 'string', format: 'uuid' },
                      participantName: { type: 'string' },
                      roleInTeam: { type: 'string', enum: ['leader', 'member'] },
                      color: badgeColor,
                      qrToken: { type: 'string', nullable: true },
                      qrImageDataUrl: { type: 'string', nullable: true },
                      isRevoked: { type: 'boolean' },
                      isCheckedIn: { type: 'boolean' },
                      email: { type: 'string', nullable: true },
                      emailStatus: {
                        type: 'string',
                        enum: ['pending', 'sent', 'failed'],
                        nullable: true,
                      },
                      emailLastSentAt: { type: 'string', format: 'date-time', nullable: true },
                      emailResendAvailableAt: {
                        type: 'string',
                        format: 'date-time',
                        nullable: true,
                      },
                    },
                  },
                },
              },
            },
            'Team badges',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires team role'),
        },
      },
    },
    '/participants/badge/{participantId}/resend-email': {
      post: {
        tags: ['Team Portal'],
        summary: 'Resend one member badge email, at most once per hour (Team only)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('participantId')],
        responses: {
          200: json(ref('ResendBadgeEmailResponse'), 'Delivery attempted'),
          400: errorResponse('Invalid participant id'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires team role'),
          404: errorResponse('Not a participant of the caller team'),
          409: errorResponse('Badge revoked or no email on file'),
          429: errorResponse(
            'Sent less than an hour ago; details.emailResendAvailableAt says when',
          ),
        },
      },
    },
    '/challenges': {
      get: {
        tags: ['Challenges'],
        summary: 'Both challenges with the caller team access state (Team only)',
        description:
          'Before the event: { available: false, reason: "EVENT_NOT_STARTED" }. Each item: { challenge, access: locked|early|public, ctfSolved, content|null }.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json({ type: 'object' }, 'Challenge list or unavailable state'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires team role'),
        },
      },
    },
    '/challenges/current': {
      get: {
        tags: ['Challenges'],
        summary: 'The running (or last ended) challenge for the caller team (Team only)',
        description:
          'Content is returned before publicAt only to teams that solved this challenge Mini-CTF. Unavailable reasons: EVENT_NOT_STARTED, NO_CHALLENGE_STARTED.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json({ type: 'object' }, 'Current challenge or unavailable state'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires team role'),
        },
      },
    },
    '/admin/challenges': {
      get: {
        tags: ['Challenges'],
        summary: 'List challenges with content, status and Mini-CTF solves (Admin only)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json({ type: 'object' }, 'Challenges'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
        },
      },
      post: {
        tags: ['Challenges'],
        summary: 'Create a challenge (Admin only, audited)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['position', 'title', 'description'],
                additionalProperties: false,
                properties: {
                  position: { type: 'integer', minimum: 1, example: 1 },
                  title: { type: 'string', maxLength: 150 },
                  summary: { type: 'string', maxLength: 500 },
                  description: { type: 'string' },
                  problemStatement: { type: 'string' },
                  deliverables: { type: 'array', items: { type: 'string' } },
                  resources: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        url: { type: 'string', format: 'uri' },
                      },
                    },
                  },
                  publicDelayMinutes: { type: 'integer', minimum: 0, example: 60 },
                },
              },
            },
          },
        },
        responses: {
          201: json({ type: 'object' }, 'Created challenge'),
          400: errorResponse('Invalid payload'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          409: errorResponse('Position already taken'),
        },
      },
    },
    '/admin/challenges/{id}': {
      patch: {
        tags: ['Challenges'],
        summary: 'Update challenge content or public delay (Admin only, audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('id')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                minProperties: 1,
                additionalProperties: false,
                properties: {
                  title: { type: 'string', maxLength: 150 },
                  summary: { type: 'string', maxLength: 500 },
                  description: { type: 'string' },
                  problemStatement: { type: 'string' },
                  deliverables: { type: 'array', items: { type: 'string' } },
                  resources: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        url: { type: 'string', format: 'uri' },
                      },
                    },
                  },
                  publicDelayMinutes: { type: 'integer', minimum: 0, example: 60 },
                },
              },
            },
          },
        },
        responses: {
          200: json({ type: 'object' }, 'Updated challenge'),
          400: errorResponse('Invalid payload'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown challenge'),
        },
      },
    },
    '/admin/challenges/{id}/start': {
      post: {
        tags: ['Challenges'],
        summary: 'Start a challenge (Admin only, audited; event must be live)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('id')],
        responses: {
          200: json({ type: 'object' }, 'Updated challenge'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown challenge'),
          409: errorResponse(
            'Event not live, another challenge running, an earlier challenge not ended, or already started',
          ),
        },
      },
    },
    '/admin/challenges/{id}/end': {
      post: {
        tags: ['Challenges'],
        summary: 'End a challenge (Admin only, audited; event must be live)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('id')],
        responses: {
          200: json({ type: 'object' }, 'Updated challenge'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown challenge'),
          409: errorResponse('Event not live, or challenge not running'),
        },
      },
    },
    '/admin/overview': {
      get: {
        tags: ['Admin Operations'],
        summary: 'Situation board aggregates (Admin only)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json({ type: 'object', description: 'adminOverviewResponseSchema' }, 'Overview'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
        },
      },
    },
    '/admin/ctf': {
      get: {
        tags: ['Admin Operations'],
        summary: 'Mini-CTF board: clock, stages and team progress (Admin only)',
        description:
          'Read-only. Stages expose `answerConfigured` only; answers and digests are never sent.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json(
            { type: 'object', description: 'adminCtfOverviewResponseSchema' },
            'Mini-CTF board',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
        },
      },
    },
    '/admin/results': {
      get: {
        tags: ['Admin Operations'],
        summary: 'Ranked results: Mini-CTF, both challenges and final score (Admin only)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json({ type: 'object', description: 'adminResultsResponseSchema' }, 'Results'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
        },
      },
    },
    '/admin/teams/{teamId}/scores': {
      patch: {
        tags: ['Admin Operations'],
        summary: 'Set or clear a team score override (Admin only, audited)',
        description:
          'Body: `updateTeamScoresRequestSchema` — `ctfPoints` (0–10), `challenge1Score`, `challenge2Score` (0–100); `null` clears an override.',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('teamId')],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          200: json({ type: 'object', description: 'teamResultSchema' }, 'Updated team result'),
          400: errorResponse('Invalid scores'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown team'),
        },
      },
    },
    '/admin/teams/{teamId}': {
      get: {
        tags: ['Admin Operations'],
        summary: 'One team (Admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('teamId')],
        responses: {
          200: json(
            { type: 'object', description: 'AdminTeam (adminTeamSchema)' },
            'Refreshed team',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown team'),
        },
      },
      patch: {
        tags: ['Admin Operations'],
        summary: 'Rename a team (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('teamId')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: json(
            { type: 'object', description: 'AdminTeam (adminTeamSchema)' },
            'Refreshed team',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown team'),
          409: errorResponse('Name taken'),
        },
      },
      delete: {
        tags: ['Admin Operations'],
        summary: 'Delete a team before the event goes live (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('teamId')],
        responses: {
          204: { description: 'Done' },
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown team'),
          409: errorResponse('Event already live'),
        },
      },
    },
    '/admin/teams/{teamId}/status': {
      post: {
        tags: ['Admin Operations'],
        summary: 'Set team standing: active, withdrawn or disqualified (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('teamId')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['active', 'withdrawn', 'disqualified'] },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: json(
            { type: 'object', description: 'AdminTeam (adminTeamSchema)' },
            'Refreshed team',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          400: errorResponse('Reason missing'),
          404: errorResponse('Unknown team'),
          409: errorResponse('Already in this status'),
        },
      },
    },
    '/admin/teams/{teamId}/reset-password': {
      post: {
        tags: ['Admin Operations'],
        summary: 'Generate a new team password and end its sessions (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('teamId')],
        responses: {
          200: json(
            {
              type: 'object',
              properties: {
                teamId: { type: 'string' },
                temporaryPassword: { type: 'string' },
                revokedSessions: { type: 'integer' },
              },
            },
            'Password shown once',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown team'),
        },
      },
    },
    '/admin/teams/{teamId}/participants': {
      post: {
        tags: ['Admin Operations'],
        summary: 'Add a member and email their badge (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('teamId')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email'],
                properties: { name: { type: 'string' }, email: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          201: json(
            { type: 'object', description: 'AdminTeam (adminTeamSchema)' },
            'Refreshed team',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown team'),
          409: errorResponse('Team full or email already registered'),
        },
      },
    },
    '/admin/teams/{teamId}/ctf-solves': {
      post: {
        tags: ['Admin Operations'],
        summary: 'Grant Mini-CTF early access (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('teamId')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['challengeId'],
                properties: { challengeId: { type: 'string', format: 'uuid' } },
              },
            },
          },
        },
        responses: {
          201: json(
            { type: 'object', description: 'AdminTeam (adminTeamSchema)' },
            'Refreshed team',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown team or challenge'),
          409: errorResponse('Already granted'),
        },
      },
    },
    '/admin/teams/{teamId}/ctf-solves/{challengeId}': {
      delete: {
        tags: ['Admin Operations'],
        summary: 'Withdraw Mini-CTF early access (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('teamId'), uuidPathParam('challengeId')],
        responses: {
          200: json(
            { type: 'object', description: 'AdminTeam (adminTeamSchema)' },
            'Refreshed team',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('No such solve'),
        },
      },
    },
    '/admin/participants/{participantId}': {
      patch: {
        tags: ['Admin Operations'],
        summary: 'Fix a participant name or email (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('participantId')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string' }, email: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: json(
            { type: 'object', description: 'AdminTeam (adminTeamSchema)' },
            'Refreshed team',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown participant'),
          409: errorResponse('Email already registered'),
        },
      },
      delete: {
        tags: ['Admin Operations'],
        summary: 'Remove a non-leader member (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('participantId')],
        responses: {
          200: json(
            { type: 'object', description: 'AdminTeam (adminTeamSchema)' },
            'Refreshed team',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown participant'),
          409: errorResponse('Leader cannot be removed'),
        },
      },
    },
    '/admin/participants/{participantId}/payment': {
      put: {
        tags: ['Admin Operations'],
        summary: 'Mark one participant fee paid or unpaid (audited, idempotent)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('participantId')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['paid'],
                additionalProperties: false,
                properties: { paid: { type: 'boolean' } },
              },
            },
          },
        },
        responses: {
          200: json(
            { type: 'object', description: 'AdminTeam (adminTeamSchema)' },
            'Refreshed team',
          ),
          400: errorResponse('Invalid body'),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown participant'),
        },
      },
    },
    '/admin/participants/{participantId}/check-in': {
      post: {
        tags: ['Admin Operations'],
        summary: 'Manual check-in without QR (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('participantId')],
        responses: {
          200: json(
            { type: 'object', description: 'AdminTeam (adminTeamSchema)' },
            'Refreshed team',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown participant'),
          409: errorResponse('Already checked in or team not active'),
        },
      },
      delete: {
        tags: ['Admin Operations'],
        summary: 'Undo a check-in (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('participantId')],
        responses: {
          200: json(
            { type: 'object', description: 'AdminTeam (adminTeamSchema)' },
            'Refreshed team',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown participant'),
          409: errorResponse('Not checked in'),
        },
      },
    },
    '/admin/participants/{participantId}/reissue-badge': {
      post: {
        tags: ['Admin Operations'],
        summary: 'Issue a new QR badge; the old one stops working (audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('participantId')],
        responses: {
          200: json(
            {
              type: 'object',
              properties: {
                participantId: { type: 'string' },
                issuedAt: { type: 'string' },
                emailQueued: { type: 'boolean' },
              },
            },
            'New badge',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown participant'),
        },
      },
    },
    '/admin/badges/resend-failed': {
      post: {
        tags: ['Admin Operations'],
        summary: 'Requeue every failed badge email (audited)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: json(
            { type: 'object', properties: { queued: { type: 'integer' } } },
            'Emails queued',
          ),
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
        },
      },
    },
    '/announcements/{announcementId}': {
      delete: {
        tags: ['Admin Operations'],
        summary: 'Delete an announcement (Admin only, audited)',
        security: [{ bearerAuth: [] }],
        parameters: [uuidPathParam('announcementId')],
        responses: {
          204: { description: 'Done' },
          401: errorResponse('Unauthenticated'),
          403: errorResponse('Requires admin role'),
          404: errorResponse('Unknown announcement'),
        },
      },
    },
  },
} as const;
