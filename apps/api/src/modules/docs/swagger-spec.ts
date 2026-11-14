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
            required: ['name', 'email', 'password'],
            properties: {
              name: { type: 'string', example: 'Sarra Ben Ahmed' },
              email: { type: 'string', format: 'email', example: 'leader@quantumcoders.tn' },
              password: { type: 'string', minLength: 12, example: 'SuperSecureSecret123!' },
            },
          },
          members: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Karim Mansour' },
                email: { type: 'string', format: 'email', example: 'karim@quantumcoders.tn' },
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
    { name: 'Admin', description: 'Security audit logs, team rosters, and jury overview' },
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
        summary: 'Register a new team (3–5 members)',
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
        summary: 'List all teams with member check-in states (Admin only)',
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
                      items: { $ref: '#/components/schemas/TeamResponse' },
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
        summary: 'List jury accounts (Admin only)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Jury accounts roster',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          email: { type: 'string', format: 'email' },
                          createdAt: { type: 'string', format: 'date-time' },
                        },
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
  },
} as const;
