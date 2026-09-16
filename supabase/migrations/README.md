# Supabase Migration Execution Order

## CRITICAL: Execute SQL files in this exact order

The following SQL files must be applied in order. Later files may override earlier ones using `CREATE OR REPLACE FUNCTION`.

### Execution Order

1. **schema.sql** - Base tables and RLS policies
2. **admin-schema.sql** - Admin functions, permissions, profile triggers
3. **financial-rewrite.sql** - Financial RPCs (approve_clip, request_payout, complete_payout_request, get_wallet_balance, get_campaign_budget)
4. **finance-consolidation.sql** - Update clip status, adjust campaign budget
5. **integrity-constraints.sql** - CHECK constraints, data validation
6. **campaign-state-machine-phase1.sql** - Campaign lifecycle (create_campaign, campaign_action)
7. **campaign-launch-payments.sql** - Launch payment RPCs (submit_campaign_launch_payment, submit_clip)
8. **campaign-budget-lock.sql** - Budget lock triggers
9. **security-hardening-migration.sql** - Security fixes (admin permissions, payout lifecycle, audit logs)
10. **security-regression-tests.sql** - Regression test suite

### Important Notes

- **DO NOT** run files out of order - later files intentionally override earlier ones
- **financial-rewrite.sql** contains the AUTHORITATIVE `get_wallet_balance` implementation
- **admin-schema.sql** also defines `get_wallet_balance` but it will be overwritten by financial-rewrite.sql
- **campaign-state-machine-phase1.sql** contains the AUTHORITATIVE `campaign_action` with launch payment verification
- **admin-schema.sql** also defines `campaign_action` but it will be overwritten

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
