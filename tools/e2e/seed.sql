-- Test data for the signed-in user (runs as superuser, so user_id is explicit).
do $$
declare u uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into public.list_items (user_id, list, title, position) values
    (u, 'shopping', 'Oat milk', 1), (u, 'shopping', 'Eggs', 2), (u, 'shopping', 'Spinach', 3),
    (u, 'shopping', 'Rice', 4), (u, 'shopping', 'Coffee beans', 5);
  insert into public.list_items (user_id, list, title, status, completed_at, position) values
    (u, 'shopping', 'Bananas', 'done', now(), 6);
  insert into public.list_items (user_id, list, title, subtitle, meta, position) values
    (u, 'albums', 'In Rainbows', 'Radiohead', '{"artwork":"http://localhost:54400/cover/0.svg","url":"https://music.apple.com/gb/album/1109714933","year":"2007"}', 1),
    (u, 'albums', 'Blonde', 'Frank Ocean', '{"artwork":"http://localhost:54400/cover/1.svg","year":"2016"}', 2),
    (u, 'albums', 'Promises', 'Floating Points, Pharoah Sanders', '{"artwork":"http://localhost:54400/cover/2.svg","year":"2021"}', 3);
  insert into public.list_items (user_id, list, title, subtitle, meta, status, position) values
    (u, 'books', 'Piranesi', 'Susanna Clarke', '{"artwork":"http://localhost:54400/cover/3.svg","year":"2020"}', 'active', 1),
    (u, 'books', 'Klara and the Sun', 'Kazuo Ishiguro', '{"artwork":"http://localhost:54400/cover/4.svg"}', 'open', 2),
    (u, 'movies', 'Paddington 2', 'Paul King', '{"artwork":"http://localhost:54400/cover/1.svg","year":"2017"}', 'open', 1),
    (u, 'movies', 'Past Lives', 'Celine Song', '{"artwork":"http://localhost:54400/cover/3.svg","year":"2023"}', 'open', 2);
  insert into public.reminders (user_id, title, due_on, recurrence, notify_days_before) values
    (u, 'Pay rent', date_trunc('month', current_date + interval '1 month')::date, 'monthly', 3),
    (u, 'Phone bill', current_date + 2, 'monthly', 3),
    (u, 'Renew railcard', current_date + 40, 'yearly', 7);
end $$;
