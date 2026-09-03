function makeRoute({
  branch,
  routeKey,
  location,
  appointmentType,
  visitReason,
  reasonId,
  guidance,
  bookingMode = 'online',
  requiresRecentConsultOrPackage = false,
  requiresPriorConsult = false
}) {
  return Object.freeze({
    branch,
    routeKey,
    reasonId,
    selection: Object.freeze({ location, appointmentType, visitReason, reasonId }),
    guidance,
    bookingMode,
    requiresRecentConsultOrPackage,
    requiresPriorConsult
  });
}

const inOfficeMedical = [
  ['medical_acne', 'acne', '42462', 'A focused in-office appointment exclusively for addressing acne.', 'online'],
  ['medical_rash', 'rash', '54290', 'A focused in-office appointment exclusively for addressing a skin rash.', 'online'],
  ['medical_hair_loss', 'hair loss', '54289', 'A focused in-office appointment exclusively for addressing hair loss.', 'online'],
  ['skin_cancer_screening', 'skin cancer screening', '24375', 'A full-body exam exclusively for evaluating and diagnosing skin cancers.', 'online'],
  ['medical_prescription_refill', 'prescription refill', '24395', 'A focused in-office appointment exclusively for prescription refills.', 'online'],
  ['medical_follow_up', 'follow-up', '54288', 'A focused appointment for following up on a previously diagnosed condition or treatment.', 'online'],
  ['medical_focused', 'focused', '50633', 'A focused appointment exclusively for one condition or concern. Skin cancer screening is booked separately.', 'online'],
  ['medical_standard', 'standard', '24340', 'A standard appointment for two or three concerns. Skin cancer screening is booked separately.', 'call'],
  ['medical_medicare', 'medicare / prior epstein', '54287', 'A standard appointment with a Dermatologist for Medicare patients and prior Dr. Anne Epstein patients.', 'online'],
  ['medical_referral', 'referral', '54291', 'Referral scheduling is coordinated by staff after required paperwork is processed. This page does not submit paperwork or initiate outreach.', 'call'],
  ['medical_surgical_procedure', 'surgical procedure', '54292', 'A consultation is required before surgical procedures. Call to schedule after the consultation.', 'call']
].map(([routeKey, visitReason, reasonId, guidance, bookingMode]) => makeRoute({
  branch: 'in_office_medical', routeKey, location: 'in-office',
  appointmentType: 'medical appointment', visitReason, reasonId, guidance, bookingMode,
  requiresPriorConsult: routeKey === 'medical_surgical_procedure'
}));

const cosmeticConsult = [
  ['consult_wrinkles', 'cosmetic consultation', '24392', 'The standard cosmetic consultation for wrinkles, injectables, and treatment planning.'],
  ['consult_discoloration', 'discoloration / pigment', '24380', 'A targeted cosmetic consultation for discoloration and pigment.'],
  ['consult_aging_skin', 'aging skin', '24383', 'A targeted cosmetic consultation for aging skin concerns.'],
  ['consult_body_sculpting', 'body sculpting / coolsculpting', '24382', 'A targeted consultation for body sculpting and CoolSculpting.']
].map(([routeKey, visitReason, reasonId, guidance]) => makeRoute({
  branch: 'cosmetic_consult', routeKey, location: 'in-office',
  appointmentType: 'cosmetic consult', visitReason, reasonId, guidance
}));

const cosmeticFacial = [
  ['facial_glass', 'glass facial', '54293'],
  ['facial_premium', 'premium facial', '54294'],
  ['facial_diamond_glow', 'diamond glow', '24388'],
  ['facial_signature', 'signature facial', '54296'],
  ['facial_acne', 'acne facial', '54295'],
  ['facial_refresh', 'refresh facial', '24386'],
  ['facial_extractions_dermaplane', 'extractions / dermaplane', '71390']
].map(([routeKey, visitReason, reasonId]) => makeRoute({
  branch: 'cosmetic_facial', routeKey, location: 'in-office',
  appointmentType: 'cosmetic facial', visitReason, reasonId,
  guidance: `${visitReason.charAt(0).toUpperCase()}${visitReason.slice(1)} service with a licensed aesthetician.`
}));

const cosmeticTreatment = [
  ['treatment_neuromodulator', 'botox / dysport / jeuveau', '24379', 'Botox, Dysport, or Jeuveau treatment. Consultation may be recommended when the appropriate treatment is uncertain.', 'online'],
  ['treatment_sculptra', 'sculptra', '71358', 'Sculptra treatment for patients with an existing package or consultation within the last 90 days.', 'mixed'],
  ['treatment_laser_hair_removal', 'laser hair removal', '24389', 'Laser hair removal for patients with a package or consultation within the last 90 days.', 'online'],
  ['treatment_chemical_peel', 'chemical peel', '24385', 'Chemical peel for patients with a package or consultation within the last 90 days.', 'online'],
  ['treatment_skinpen', 'skinpen microneedle', '24396', 'SkinPen microneedling for patients with a package or consultation within the last 90 days.', 'online'],
  ['treatment_ipl_resurfx', 'ipl / resurfx / photofractional', '54232', 'IPL, ResurFX, or Photofractional treatment for patients with a package or consultation within the last 90 days.', 'online'],
  ['treatment_rf_microneedling', 'rf microneedling', '71359', 'RF microneedling for patients with a package or consultation within the last 90 days.', 'online'],
  ['treatment_filler_other', 'filler / other treatment', '24381', 'Consultation is required before filler or other unlisted cosmetic treatment.', 'call']
].map(([routeKey, visitReason, reasonId, guidance, bookingMode]) => makeRoute({
  branch: 'cosmetic_treatment', routeKey, location: 'in-office',
  appointmentType: 'cosmetic treatment', visitReason, reasonId, guidance, bookingMode,
  requiresRecentConsultOrPackage: [
    'treatment_sculptra',
    'treatment_laser_hair_removal',
    'treatment_chemical_peel',
    'treatment_skinpen',
    'treatment_ipl_resurfx',
    'treatment_rf_microneedling'
  ].includes(routeKey),
  requiresPriorConsult: routeKey === 'treatment_filler_other'
}));

const virtualMedical = [
  ['virtual_acne', 'acne appt', '54297', 'A virtual appointment exclusively for acne.'],
  ['virtual_prescription_refill', 'prescription refill appt', '54234', 'A virtual appointment exclusively for prescription refills.'],
  ['virtual_accutane_refill', 'prescription refill accutane appt', '24378', 'A virtual appointment exclusively for Accutane prescription refills.'],
  ['virtual_focused', 'focused appt', '24376', 'A virtual appointment exclusively for one condition or concern.'],
  ['virtual_follow_up', 'follow-up appt', '54233', 'A virtual follow-up for a previously diagnosed condition or treatment.']
].map(([routeKey, visitReason, reasonId, guidance]) => makeRoute({
  branch: 'virtual_medical', routeKey, location: 'virtual',
  appointmentType: 'telemed', visitReason, reasonId, guidance
}));

export const bookingCatalog = Object.freeze([
  ...inOfficeMedical,
  ...cosmeticConsult,
  ...cosmeticFacial,
  ...cosmeticTreatment,
  ...virtualMedical
]);

export const routeByKey = new Map(bookingCatalog.map(route => [route.routeKey, route]));
