# @zarax/audit-log

Layer 4 — append-only, structured audit logging for sensitive actions. See
`docs/production-standards.md` item #1.

## Usage

For routes where a Principal already exists when the request starts:
```ts
@Audited({ action: 'agent.updated', resourceType: 'agent', resourceIdParam: 'id' })
@Patch(':id')
update(...) { ... }
```
`AuditInterceptor` (registered globally via `AuditLogModule.forRoot()`) records the
event automatically after a successful response.

For pre-auth actions (signup, login) where no Principal exists yet at request start,
call `AuditLogService.record()` directly once the resulting identity is known — see
`services/api`'s `AuthService` for the reference pattern.

Audit rows are immutable — `AuditLogRepository` (in `@zarax/database`) exposes no
update/delete method, only `record()` and `listForTenant()`.
