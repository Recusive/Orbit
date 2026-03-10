# User Profile System — End-to-End with Supabase

## Context

Orbit currently has no concept of user identity. We need a profile system to:

- Track users (name, email, company/role) for marketing and product insights
- Send marketing emails and feature announcements
- Lay groundwork for future website integration, subscriptions, and billing

**Decision**: Supabase (Postgres + RLS + Edge Functions). Profile collection is **optional** during onboarding (skip button), with full management in Settings. Fields: email, display name, marketing consent, company/role.

---

## Phase 1: Supabase Project Setup

### 1.1 Create Supabase project

- Go to supabase.com → New project
- Note the **Project URL** (`https://<ref>.supabase.co`) and **anon key**

### 1.2 SQL migration — `profiles` table

```sql
CREATE TABLE profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  company         TEXT,
  role            TEXT,
  install_id      TEXT NOT NULL,
  platform        TEXT NOT NULL,       -- 'macos' | 'windows' | 'linux'
  app_version     TEXT,
  marketing_consent     BOOLEAN NOT NULL DEFAULT false,
  consent_timestamp     TIMESTAMPTZ,
  subscription_tier     TEXT DEFAULT 'free',
  stripe_customer_id    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_profiles_install_id ON profiles(install_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 1.3 SQL migration — `profile_events` table

```sql
CREATE TABLE profile_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profile_events_profile ON profile_events(profile_id);
CREATE INDEX idx_profile_events_type ON profile_events(event_type);
```

### 1.4 Row Level Security (RLS)

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_events ENABLE ROW LEVEL SECURITY;

-- Anon key can insert new profiles
CREATE POLICY "anon_insert_profiles" ON profiles
  FOR INSERT WITH CHECK (true);

-- Profiles can be read/updated/deleted by matching install_id
-- (passed as a header: x-install-id)
CREATE POLICY "install_id_select" ON profiles
  FOR SELECT USING (install_id = current_setting('request.headers', true)::json->>'x-install-id');

CREATE POLICY "install_id_update" ON profiles
  FOR UPDATE USING (install_id = current_setting('request.headers', true)::json->>'x-install-id');

CREATE POLICY "install_id_delete" ON profiles
  FOR DELETE USING (install_id = current_setting('request.headers', true)::json->>'x-install-id');

-- Events: insert allowed, select by profile ownership
CREATE POLICY "anon_insert_events" ON profile_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "events_select_own" ON profile_events
  FOR SELECT USING (
    profile_id IN (
      SELECT id FROM profiles
      WHERE install_id = current_setting('request.headers', true)::json->>'x-install-id'
    )
  );
```

### 1.5 Update CSP in Tauri config

**File**: `src-tauri/tauri.conf.json` (line 40)

Add Supabase domain to `connect-src`:

```
"connect-src": "'self' https://api.anthropic.com ipc://localhost https://streamdown.ai http://localhost:* ws://localhost:* https://github.com https://*.githubusercontent.com https://<ref>.supabase.co"
```

---

## Phase 2: Zod Schemas (shared-schemas)

### 2.1 Create profile schemas

**Create**: `packages/shared-schemas/src/profile/profile.ts`

```typescript
// Zod schemas for: UserProfile, CreateProfileRequest, UpdateProfileRequest
// Fields: id, email, displayName, company, role, installId, platform,
//         appVersion, marketingConsent, consentTimestamp, subscriptionTier,
//         createdAt, updatedAt
```

### 2.2 Barrel export

**Create**: `packages/shared-schemas/src/profile/index.ts`
**Modify**: `packages/shared-schemas/src/index.ts` — add `export * from './profile'`

---

## Phase 3: Install ID (Rust)

### 3.1 Add `install_id` to Settings struct

**Modify**: `crates/common/settings/src/lib.rs`

Add field to `Settings`:

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
pub install_id: Option<String>,
```

### 3.2 Add Tauri command

**Modify**: `src-tauri/src/commands/common/diagnostics.rs`

New command `get_install_id`:

- Check `settings.install_id` — return if exists
- macOS: run `ioreg -rd1 -c IOPlatformExpertDevice` and parse `IOPlatformUUID`
- Fallback: generate `UUID` via `uuid::Uuid::new_v4()`
- Save to settings, return

### 3.3 Register command

**Modify**: `src-tauri/src/lib.rs` — add `diagnostics::get_install_id` to `invoke_handler`

---

## Phase 4: Profile Zustand Store

### 4.1 Create store

**Create**: `apps/agent/src/stores/profile/profile-store.ts`

```
State:
  profile: UserProfile | null
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error'
  lastSyncedAt: number | null
  profileSkipped: boolean
  syncError: string | null

Actions:
  setProfile(profile)
  updateProfile(updates)
  clearProfile()
  setSyncStatus(status, error?)
  setProfileSkipped(skipped)
  markSynced()
```

Pattern: `create()(persist(immer(...)))` — persist `profile`, `profileSkipped`, `lastSyncedAt` only.

### 4.2 Barrel files

**Create**: `apps/agent/src/stores/profile/index.ts`
**Modify**: `apps/agent/src/stores/index.ts` — add `export * from './profile'`

---

## Phase 5: Supabase Sync Service

### 5.1 API constants

**Create**: `apps/agent/src/lib/api/profile.ts`

```typescript
export const SUPABASE_URL = 'https://<ref>.supabase.co';
export const SUPABASE_ANON_KEY = '<anon-key>';
```

### 5.2 Sync service

**Create**: `apps/agent/src/services/profile/profile-sync-service.ts`

Module-level singleton (same pattern as `ChatMessageService`). Uses `fetch()` directly against Supabase PostgREST API. Sends `x-install-id` header for RLS.

Methods:

- `createProfile(data: CreateProfileRequest): Promise<UserProfile>`
- `updateProfile(id: string, data: UpdateProfileRequest): Promise<UserProfile>`
- `fetchProfileByInstallId(installId: string): Promise<UserProfile | null>`
- `deleteProfile(id: string): Promise<void>`
- `recordEvent(profileId: string, eventType: string, metadata?: Record<string, unknown>): Promise<void>`

Retry: 3 attempts, exponential backoff (1s, 2s, 4s). On persistent failure, log warning and leave local state intact for next app launch retry.

### 5.3 Barrel file

**Create**: `apps/agent/src/services/profile/index.ts`

---

## Phase 6: Onboarding — Profile Step

### 6.1 Extend onboarding step type

**Modify**: `apps/agent/src/stores/onboarding/onboarding-store.ts`

Change: `type OnboardingStep = 'welcome' | 'provider' | 'profile' | 'complete'`

### 6.2 Create ProfileStep component

**Create**: `apps/agent/src/components/onboarding/ProfileStep.tsx`

Design: matches `WelcomeStep.tsx` liquid-glass pattern (`liquid-glass-btn`, `liquid-glass-title`, max-w-[360px] centered layout).

Fields:

- Email input (required, Zod-validated)
- Display name input (optional)
- Company input (optional)
- Role input (optional)
- Marketing consent checkbox with legal text
- "Continue" primary button → creates profile + syncs to Supabase
- "Skip for now" text link → sets `profileSkipped: true`, completes onboarding

### 6.3 Wire into OnboardingFlow

**Modify**: `apps/agent/src/components/onboarding/OnboardingFlow.tsx`

- Render `ProfileStep` when `currentStep === 'profile'`
- `handleProviderComplete` → `setStep('profile')` (instead of `completeOnboarding()`)
- New `handleProfileComplete` → save profile, sync, `completeOnboarding()`
- New `handleProfileSkip` → `setProfileSkipped(true)`, `completeOnboarding()`

---

## Phase 7: Settings — Profile Page

### 7.1 Add to settings types

**Modify**: `apps/agent/src/components/modals/settings/types.ts`

Add `'profile'` to `SettingsSection` union (before `'account'`).

### 7.2 Create ProfileSettings page

**Create**: `apps/agent/src/components/modals/settings/pages/ProfileSettings.tsx`

Uses existing components: `SectionHeader`, `SectionDivider`, `SettingItem` from `../components`.

Sections:

1. **Profile Info card** — editable display name, email, company, role
2. **Marketing Preferences** — consent toggle with timestamp display
3. **Sync Status** — last synced indicator, manual sync button
4. **Danger Zone** — "Delete my profile" destructive button (calls Supabase delete + clears local store)

Shows "Complete your profile" banner if `profileSkipped === true`.

### 7.3 Update sidebar

**Modify**: `apps/agent/src/components/modals/settings/SettingsSidebar.tsx`

Add nav item for `'profile'` at position before `'account'` in `NAV_ITEMS`:

```typescript
{ id: 'profile', label: 'Profile', icon: <UserCircle className="h-4 w-4" /> }
```

### 7.4 Register lazy component

**Modify**: `apps/agent/src/components/modals/settings/pages/index.ts`

Add:

```typescript
export { ProfileSettings } from './ProfileSettings';
// In SETTINGS_PAGE_COMPONENTS:
profile: lazyWithMinDelay(() => import('./ProfileSettings')),
```

---

## Phase 8: App Launch Sync + Sentry Integration

### 8.1 Profile sync hook

**Create**: `apps/agent/src/hooks/profile/use-profile-sync.ts`

Called once from `TauriProvider` or a new `ProfileProvider`:

1. Get `install_id` from Tauri command
2. If local profile exists → background sync (non-blocking `updateProfile`)
3. If no local profile but `install_id` exists remotely → pull and hydrate store
4. Set Sentry user context when profile is available

### 8.2 Sentry user context

In the sync hook, after profile is available:

```typescript
Sentry.setUser({ id: profile.id, email: profile.email, username: profile.displayName });
```

On profile deletion: `Sentry.setUser(null)`

### 8.3 Barrel file

**Create**: `apps/agent/src/hooks/profile/index.ts`

---

## Files Summary

### New Files (14)

| File                                                                  | Purpose                           |
| --------------------------------------------------------------------- | --------------------------------- |
| `packages/shared-schemas/src/profile/profile.ts`                      | Zod schemas                       |
| `packages/shared-schemas/src/profile/index.ts`                        | Barrel                            |
| `apps/agent/src/stores/profile/profile-store.ts`                      | Zustand store                     |
| `apps/agent/src/stores/profile/index.ts`                              | Barrel                            |
| `apps/agent/src/services/profile/profile-sync-service.ts`             | Supabase HTTP client              |
| `apps/agent/src/services/profile/index.ts`                            | Barrel                            |
| `apps/agent/src/hooks/profile/use-profile-sync.ts`                    | Launch sync + Sentry              |
| `apps/agent/src/hooks/profile/index.ts`                               | Barrel                            |
| `apps/agent/src/lib/api/profile.ts`                                   | Supabase URL + anon key constants |
| `apps/agent/src/components/onboarding/ProfileStep.tsx`                | Onboarding collection UI          |
| `apps/agent/src/components/modals/settings/pages/ProfileSettings.tsx` | Settings management UI            |

### Modified Files (10)

| File                                                            | Change                               |
| --------------------------------------------------------------- | ------------------------------------ |
| `packages/shared-schemas/src/index.ts`                          | Add profile re-export                |
| `crates/common/settings/src/lib.rs`                             | Add `install_id` field               |
| `src-tauri/src/commands/common/diagnostics.rs`                  | Add `get_install_id` command         |
| `src-tauri/src/lib.rs`                                          | Register `get_install_id` in handler |
| `src-tauri/tauri.conf.json`                                     | Add Supabase domain to CSP           |
| `apps/agent/src/stores/index.ts`                                | Export profile store                 |
| `apps/agent/src/stores/onboarding/onboarding-store.ts`          | Add `'profile'` step                 |
| `apps/agent/src/components/onboarding/OnboardingFlow.tsx`       | Wire ProfileStep                     |
| `apps/agent/src/components/modals/settings/types.ts`            | Add `'profile'` section              |
| `apps/agent/src/components/modals/settings/SettingsSidebar.tsx` | Add profile nav item                 |
| `apps/agent/src/components/modals/settings/pages/index.ts`      | Register lazy ProfileSettings        |

---

## Verification

### Unit tests

- `bun run test` — profile store tests (create, update, clear, persist)
- `cargo test` — install_id generation and settings roundtrip

### Manual E2E test

1. `bunx tauri dev` — launch app
2. Reset onboarding: browser console → `localStorage.removeItem('orbit-onboarding')`
3. Walk through onboarding → verify ProfileStep appears after ProviderStep
4. Fill email + name → Continue → verify Supabase `profiles` row created
5. Open Settings → Profile → edit name → verify Supabase row updated
6. Click "Skip for now" in onboarding → verify Settings shows banner
7. Delete profile → verify Supabase row removed + local store cleared

### Sync resilience

1. Disconnect network → create profile in onboarding → verify local store saves
2. Reconnect → relaunch app → verify background sync pushes to Supabase

### Lint/type check

- `bun run check` — full typecheck + lint + tests
- `cargo check` — Rust compilation
