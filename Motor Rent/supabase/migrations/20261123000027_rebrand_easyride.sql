-- Rebrand: staff replies without a first name are signed by the EasyRide team.
CREATE OR REPLACE FUNCTION public.booking_message_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare bk public.bookings; me public.profiles;
begin
  select * into bk from public.bookings where id = new.booking_id;
  select * into me from public.profiles where id = auth.uid();
  if bk.id is null or me.id is null then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.rider_id <> me.id and not public.can_see_branch(bk.branch_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select count(*) from public.booking_messages where author = me.id and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'too many messages, please wait a minute' using errcode = '54000';
  end if;
  new.author := me.id;
  new.from_staff := bk.rider_id <> me.id;
  new.author_name := case when new.from_staff then coalesce(nullif(split_part(me.full_name, ' ', 1), ''), 'EasyRide team')
                          else coalesce(me.full_name, 'Rider') end;
  new.author_avatar := me.avatar_path;
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end $function$

;
