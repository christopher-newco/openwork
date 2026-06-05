-- Fix TypeID prefix mismatch in worker_instance table
-- Error: TypeID prefix mismatch: expected 'wki' but got 'winst'

-- Show current state
SELECT id, worker_id, url, status FROM worker_instance
WHERE worker_id = 'wrk_01ktc2s5fmfer9zy3h2pr1nq6h';

-- Fix the ID prefix (winst_ -> wki_)
UPDATE worker_instance
SET id = 'wki_01ktc2s5fmfer9zy3h2pr1nq6h'
WHERE id = 'winst_01ktc2s5fmfer9zy3h2pr1nq6h';

-- Verify fix
SELECT id, worker_id, url, status FROM worker_instance
WHERE worker_id = 'wrk_01ktc2s5fmfer9zy3h2pr1nq6h';

-- Test that workers API will work now
SELECT
  w.id as worker_id,
  w.name as worker_name,
  w.status as worker_status,
  wi.id as instance_id,
  wi.url as instance_url
FROM worker w
LEFT JOIN worker_instance wi ON w.id = wi.worker_id
WHERE w.id = 'wrk_01ktc2s5fmfer9zy3h2pr1nq6h';
