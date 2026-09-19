# Supabase Migration Execution Order

## CRITICAL: Execute SQL files in this exact order

The following SQL files must be applied in order. Later files may override earlier ones using `CREATE OR REPLACE FUNCTION`.

### Execution Order

1. **schema.sql** - Base tables and RLS policies
2. **admin-schema.sql** - Admin functions, permissions, profile triggers
3. **financial-rewrite.sql** - Financial RPCs (approve_clip, get_wallet_balance, get_campaign_budget)
4. **finance-consolidation.sql** - Update clip status (no executable duplicate functions)
5. **integrity-constraints.sql** - CHECK constraints, data validation
6. **campaign-state-machine-phase1.sql** - Campaign lifecycle (create_campaign, campaign_action)
7. **campaign-launch-payments.sql** - Launch payment RPCs (submit_campaign_launch_payment, submit_clip)
8. **campaign-budget-lock.sql** - Budget lock triggers
9. **security-hardening-migration.sql** - AUTHORITATIVE security RPCs (request_payout, complete_payout_request, process_payout_request, admin_clip_action, admin_user_action, verify_campaign_launch_payment, reject_campaign_launch_payment, adjust_campaign_budget, ingest_clip_metrics, enforce_social_connection_token_protection trigger)
10. **security-regression-tests.sql** - Regression test suite

### Cashfree Extension

11. **migrations/20250101000000_cashfree_integration.sql** - Cashfree sandbox payment integration (idempotent, safe to re-run). Adds 7 columns, 2 indexes, 5 RPCs. Run AFTER step 9.
12. **migrations/20250101000001_cashfree_verified_by_fix.sql** - Fixes FK violation in Cashfree webhook verification. Sets `verified_by = NULL` and `actor_id = NULL` in audit logs (fake UUID `00000000-0000-0000-0000-000000000000` violates `REFERENCES auth.users(id)`). Run AFTER step 11.
13. **migrations/20250101000002_cashfree_trigger_fix.sql** - Fixes `enforce_campaign_launch_payment_integrity` trigger which blocked Cashfree webhook verification because `is_admin()` returns false for service_role (no JWT user). Adds temp table authorization marker (`_cf_verify_signal`) check. Run AFTER step 12.

14. **migrations/20250101000003_lock_direct_campaign_status_updates.sql** — `enforce_campaign_status_protected` trigger blocks direct Creator UPDATE of `campaigns.status`. Uses `_campaign_transition_signal` temp table. Adds signal creation to `campaign_action()`, `admin_campaign_action()`, `verify_campaign_launch_payment()`, `verify_cashfree_webhook()`. Run AFTER step 13.
15. **migrations/20250101000004_revoke_temp_table_privilege.sql** — Revokes TEMPORARY privilege from `authenticated`, `anon`, and `PUBLIC` on the database. Closes the temp-table forgery attack vector where an authenticated user could CREATE TEMPORARY TABLE `_campaign_transition_signal` to bypass the status protection trigger. SECURITY DEFINER functions are unaffected (they run as the owner). Run AFTER step 14.

### One-Time Recovery

- **cashfree-recover-existing-payment.sql** — Recovers the existing sandbox payment (order `cliptwo_ef769e74-58f4-4df9-9c5f-de3333f1b577_attempt_1`, amount ₹110). Contains trigger fix + function fix + precondition checks + RPC call + post-verification queries. Execute in SQL Editor after step 15.

### Previous Standalone Files (superseded)

- `campaign-launch-payments-cashfree.sql` — original standalone file, content now duplicated in the migration above
- `campaign-launch-payment-integrity.sql` — integrity constraints (run before Cashfree if not already applied)
- `campaign-budget-lock.sql` — budget lock triggers (step 8)
- `campaign-state-machine-phase1.sql` — campaign lifecycle (step 6)
- `security-hardening-migration.sql` — security RPCs (step 9)
- `security-regression-tests.sql` — regression tests (step 10)
- `social-and-metrics-integration-tests.sql` — integration tests
- `phase7a-security-tests.sql` — phase 7a tests
- `campaign-security-regression-tests.sql` — campaign security tests
- `cashfree-security-tests.sql` — Cashfree security tests
- `phone-api-security-tests.sql` — phone API security tests
- `campaign-assets-security.sql` — campaign assets security
- `campaign-assets-security-tests.sql` — campaign assets security tests
- `security-hardening.sql` — security hardening
- `security-regression-tests.sql` — security regression tests

### Important Notes

- **DO NOT** run files out of order - later files intentionally override earlier ones
- **security-hardening-migration.sql** contains the AUTHORITATIVE definitions for all payout and admin action RPCs
- **Earlier files** (admin-schema.sql, finance-consolidation.sql, financial-rewrite.sql, campaign-launch-payments.sql) have had their duplicate function definitions converted to non-executable comments to prevent accidental overwrites
- Each function has exactly ONE executable definition in the repository

### Payout Lifecycle

```
processing financial record
  → pending payout (request_payout)
  → processing payout (process_payout_request)
  → paid financial record (complete_payout_request)
```

**IMPORTANT**: Financial records remain in 'processing' status until complete_payout_request() confirms the UPI transfer. They are reserved by the payout request via the finance_record_ids array.

### Wallet Balance Formula

```
available = sum(processing records) - sum(pending/processing payout requests)
```

- Processing records = finalized earnings available for withdrawal
- Paid records are excluded from the processing sum automatically
- Paid payout requests must NOT be subtracted (would double-count)
- There is exactly ONE executable definition of `get_wallet_balance` in `financial-rewrite.sql`

### Service-Only RPCs (REVOKE'd from authenticated)

The following RPCs are ONLY callable by service_role:
- `ingest_clip_metrics`
- `finalize_clip_earning`
- `acquire_sync_lock`
- `release_sync_lock`
- `renew_sync_lock`

### Direct Table Write Restrictions

The following tables have INSERT/UPDATE/DELETE revoked from authenticated:
- `financial_records`
- `payout_requests`
- `wallet_ledger`
- `audit_logs`

All mutations must go through SECURITY DEFINER RPCs.

### Security-Critical Function Inventory

| Function | Authoritative File | Notes |
|----------|-------------------|-------|
| `request_payout` | security-hardening-migration.sql | With FOR UPDATE on financial_records |
| `complete_payout_request` | security-hardening-migration.sql | With advisory lock + FOR UPDATE |
| `process_payout_request` | security-hardening-migration.sql | Admin-only |
| `get_wallet_balance` | financial-rewrite.sql | Single source of truth |
| `admin_clip_action` | security-hardening-migration.sql | Permission-checked |
| `admin_user_action` | security-hardening-migration.sql | Permission-checked |
| `campaign_action` | campaign-state-machine-phase1.sql | Owner + active creator check |
| `adjust_campaign_budget` | security-hardening-migration.sql | Owner + active creator check |
| `approve_clip` | financial-rewrite.sql | Admin + permission check |
| `submit_campaign_launch_payment` | campaign-launch-payments.sql | Active creator check |
| `submit_clip` | campaign-launch-payments.sql | Active clipper check |
| `verify_campaign_launch_payment` | security-hardening-migration.sql | Admin + permission check |
| `reject_campaign_launch_payment` | security-hardening-migration.sql | Admin + permission check |
| `create_campaign` | campaign-state-machine-phase1.sql | Active creator check |
| `ingest_clip_metrics` | security-hardening-migration.sql | With verified_views regression guard |
| `enforce_social_connection_token_protection` | security-hardening-migration.sql | Trigger protecting OAuth token columns |
