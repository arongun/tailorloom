-- Phase 2: Add new profile config fields for win-back, one-and-done, and new high-value insights
ALTER TABLE insight_config ADD COLUMN IF NOT EXISTS new_high_value_window_days INTEGER;
ALTER TABLE insight_config ADD COLUMN IF NOT EXISTS one_and_done_days INTEGER;
