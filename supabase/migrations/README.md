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
9. **security-hardening-migration.sql** - AUTHORITATIVE security RPCs (request_payout, complete_payout_request, process_payout_request, admin_clip_action, admin_user_action, verify_campaign_launch_payment, reject_campaign_launch_payment)
10. **security-regression-tests.sql** - Regression test suite

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
