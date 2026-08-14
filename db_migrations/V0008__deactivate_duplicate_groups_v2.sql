UPDATE t_p54486869_greeting_initiative_.groups g
SET active = false
FROM t_p54486869_greeting_initiative_.groups g2
WHERE g.user_id = g2.user_id
  AND g.wa_id = g2.wa_id
  AND g.wa_id <> ''
  AND g.id > g2.id
  AND g.active = true
  AND g2.active = true;