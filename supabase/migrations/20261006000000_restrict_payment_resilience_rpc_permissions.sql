revoke execute on function public.claim_razorpay_webhook_event(text, text, text, text) from public;
revoke execute on function public.claim_razorpay_webhook_event(text, text, text, text) from anon;
revoke execute on function public.claim_razorpay_webhook_event(text, text, text, text) from authenticated;
grant execute on function public.claim_razorpay_webhook_event(text, text, text, text) to service_role;

revoke execute on function public.finalize_captured_razorpay_payment(text, text, bigint, text) from public;
revoke execute on function public.finalize_captured_razorpay_payment(text, text, bigint, text) from anon;
revoke execute on function public.finalize_captured_razorpay_payment(text, text, bigint, text) from authenticated;
grant execute on function public.finalize_captured_razorpay_payment(text, text, bigint, text) to service_role;
