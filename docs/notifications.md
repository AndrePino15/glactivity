# Reminder notifications

How a rent reminder reaches your phone:

1. **Your phone subscribes.** In Settings → Notifications, "Turn on for this device" asks permission and registers the phone (on iPhone, Glactivity must be added to the Home Screen first). The first time, the app creates its push keys and stores them in the database's private schema.
2. **Every morning the database wakes the app.** A scheduled job (`pg_cron`) inside Supabase calls `POST /api/cron/reminders` with a token that only exists in the database (`private.push_config.cron_token`).
3. **The app works out what to say.** With that token it reads reminders and devices (`push_batch`), picks what to announce (`apps/web/src/lib/notify.ts`): once when a reminder enters its "show on Today" window, again on the day, once if overdue. Then it sends encrypted notifications and records what it sent (`mark_notified`), forgetting devices that are gone.

No keys or tokens live in Vercel settings or in the repository.

## Turning on the daily schedule

Run once in the Supabase SQL editor, with your site's address:

```sql
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'glactivity-reminders',
  '0 8 * * *', -- 08:00 UTC: 8am in winter, 9am in summer (UK)
  $$
    select net.http_post(
      url := 'https://YOUR-SITE.vercel.app/api/cron/reminders',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('token', (select cron_token from private.push_config))
    );
  $$
);
```

To stop it: `select cron.unschedule('glactivity-reminders');`
