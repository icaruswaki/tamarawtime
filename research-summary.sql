-- Run in the Supabase SQL Editor as the project owner, not in the browser.
-- The project owner can view the study cohort; ordinary users cannot.
-- Uses a shortened, pseudonymous account identifier in place of an email.
select
  left(md5(u.id::text),12) as participant_id,
  count(distinct (e.occurred_at at time zone 'Asia/Manila')::date) as active_days,
  count(e.id) as logged_actions,
  min(e.occurred_at at time zone 'Asia/Manila') as first_action_ph,
  max(e.occurred_at at time zone 'Asia/Manila') as latest_action_ph,
  case when count(distinct (e.occurred_at at time zone 'Asia/Manila')::date) >= 3
       then 'Eligible' else 'Not eligible' end as feedback_eligibility,
  f.overall as overall_rating,
  f.ease as ease_rating,
  f.feature as most_useful_feature,
  f.comments as improvement_suggestions
from auth.users u
left join public.activity_events e on e.user_id = u.id
left join public.feedback f on f.user_id = u.id
group by u.id,f.overall,f.ease,f.feature,f.comments
order by active_days desc, latest_action_ph desc nulls last;
