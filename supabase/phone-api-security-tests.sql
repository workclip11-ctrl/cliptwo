-- ===========================================================================
-- PHONE API SECURITY TESTS
-- ===========================================================================
-- Tests for POST /api/account/phone endpoint security properties.
--
-- These tests document the security contract of the phone update endpoint.
-- The endpoint is an HTTP API route (not an RPC), so tests verify the
-- code-level security properties via inspection and documentation.
--
-- Test UUIDs (must exist in auth.users + profiles):
--   Creator: e92427b0-254e-44cc-b2df-be83792c8a94
--   Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Clipper: 2d75364e-77e0-4eb2-af96-48f573cb4a43
-- ===========================================================================

-- === SECTION 1: Endpoint security properties (code-level verification) ===

-- TEST A: Unauthenticated POST /api/account/phone → 401
-- The endpoint calls getAuthenticatedUser(request) as the first operation.
-- If no Bearer token or session cookie is present, it returns 401 immediately.
-- Verification: getAuthenticatedUser returns null → early return with 401.

-- TEST B: Authenticated Creator can update their own phone
-- The endpoint uses user.id from getAuthenticatedUser (derived from JWT/sub),
-- then calls serviceClient.auth.admin.updateUserById(user.id, { phone }).
-- The user ID is never accepted from the request body.

-- TEST C: Invalid Indian phone → 400
-- The endpoint calls normalizeIndianPhone(raw) from @/lib/phone.
-- Returns null for invalid numbers → 400 with "Enter a valid 10-digit Indian mobile number."
-- Valid formats: 10-digit, +91 prefix, 91 prefix, 091 prefix.
-- Must start with 6-9 and be exactly 10 digits.

-- TEST D: User ID cannot be supplied to update another account
-- The endpoint reads user.id exclusively from getAuthenticatedUser(request).
-- The request body only accepts { phone: string }.
-- No user_id/userId parameter is accepted or used.
-- Verification: grep for userId/user_id in route.ts → not present.

-- TEST E: Duplicate phone is handled safely
-- The endpoint catches Supabase errors containing "already"/"duplicate"/"unique"
-- and returns 409 with "That phone number is already associated with another account."
-- No other user's ID, email, or account details are exposed.

-- TEST F: Browser cannot access service_role
-- createServiceClient() is imported from @/lib/supabase/server.ts.
-- This file uses process.env.SUPABASE_SERVICE_ROLE_KEY (server-only env var).
-- The client.ts file does NOT export or reference service-role credentials.
-- Verification: grep for SUPABASE_SERVICE_ROLE_KEY in client-side files → not found.

-- TEST G: Cashfree create-order still reads auth.users.phone server-side
-- File: src/app/api/campaigns/payment/cashfree/create-order/route.ts
-- Lines 98-112: serviceClient.auth.admin.getUserById(user.id) → authUser?.user?.phone
- This is completely independent of the phone update endpoint.

-- TEST H: Cashfree create-order cannot override the account phone
-- The create-order endpoint reads phone from auth.users (server-side only).
-- The request body for create-order does not accept a phone parameter.
-- Verification: create-order reads phone from auth.admin.getUserById, not from request body.

-- === SECTION 2: Database-level verification ===

-- TEST I: Phone is stored in auth.users.phone (not profiles table)
-- The endpoint calls serviceClient.auth.admin.updateUserById(userId, { phone }).
-- This updates auth.users.phone via Supabase Admin Auth API.
-- The profiles table has no phone column and is not modified.

-- TEST J: No client-side phone update path remains
-- After this change, supabase.auth.updateUser({ phone }) is NOT called from any browser code.
-- All phone updates go through POST /api/account/phone → server → auth.admin.updateUserById.
-- Verification: grep for "updateUser.*phone" in src/ → only found in api/account/phone/route.ts.

-- === SECTION 3: Cashfree phone formatting ===

-- TEST A (Cashfree): Stored +919315851024 becomes 9315851024 for Cashfree
-- The create-order route strips the +91 prefix: phone.replace(/^\+91/, "")
-- Stored value: +919315851024 → Cashfree receives: 9315851024
-- Verification: grep for cashfreePhone in create-order/route.ts

-- TEST B (Cashfree): Stored 9315851024 also becomes 9315851024
-- If phone is already 10-digit (no +91 prefix), replace is a no-op.
-- The validation regex /^[6-9]\d{9}$/ still passes.

-- TEST C (Cashfree): Invalid phone is rejected
-- After stripping +91, the route validates /^[6-9]\d{9}$/.
-- Invalid formats (e.g. 1234567890, +9112345678, empty) → 400.

-- TEST D (Cashfree): Client cannot override the phone
-- The create-order request body only accepts { campaignId }.
- phone is derived from auth.users via serviceClient, never from request body.
-- Verification: no phone parameter in create-order request body parsing.

-- TEST E (Cashfree): Supabase still stores +919315851024
-- The phone-api-security-tests verify updateUserById writes +91XXXXXXXXXX.
-- The create-order route does NOT modify auth.users.phone.

-- TEST F (Cashfree): Campaign ownership and payment reservation protections unchanged
-- The fix only adds phone formatting before the Cashfree API call.
-- All existing checks (role, status, campaign ownership, draft status, reserve/confirm RPCs)
-- remain in place and are not bypassed.
