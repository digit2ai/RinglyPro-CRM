-- ─────────────────────────────────────────────────────────────────────────────
-- Full reset: drops all public schema objects and clears migration history.
-- Run this in the Supabase SQL editor or via: pnpm supabase db execute < supabase/reset_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Triggers on auth.users
drop trigger if exists on_auth_user_created on auth.users;

-- Functions
drop function if exists public.handle_new_user();

-- Tables (dependency order: children before parents)
drop table if exists public.persons_long_term_goals  cascade;
drop table if exists public.persons_patrimony         cascade;
drop table if exists public.persons_goals_history    cascade;
drop table if exists public.persons_score_history    cascade;
drop table if exists public.role_permissions         cascade;
drop table if exists public.user_permissions         cascade;
drop table if exists public.user_roles               cascade;
drop table if exists public.contact_request_messages cascade;
drop table if exists public.persons                  cascade;
drop table if exists public.permissions              cascade;
drop table if exists public.roles                    cascade;

-- Clear remote migration history
truncate supabase_migrations.schema_migrations;
