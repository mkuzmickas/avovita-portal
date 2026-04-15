ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS waiver_addendum text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS waiver_addendum_title text;

UPDATE public.organizations
SET
  waiver_addendum_title = 'Referral Service Disclosure — Always Best Care Senior Services',
  waiver_addendum = 'This laboratory testing service is provided exclusively by AvoVita Wellness (2490409 Alberta Ltd.), an independent private laboratory testing company. Always Best Care Senior Services acts solely as a referral source and has no involvement in the ordering, collection, processing, interpretation, or delivery of laboratory testing services. Always Best Care Senior Services is not a healthcare provider, does not employ the phlebotomists or laboratory staff involved in this service, and bears no liability whatsoever for the testing process, results, accuracy, timeliness, or any outcomes arising from the use of AvoVita Wellness services. By proceeding, you acknowledge that your agreement is solely with AvoVita Wellness and that Always Best Care Senior Services is not a party to this consent.'
WHERE slug = 'AlwaysBestCare';
