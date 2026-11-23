/**
 * The vehicle rental agreement the rider signs at handover. One text for the PDF (submit-inspection), the
 * handover screen (admin) and the website. Change the version when the wording changes; signed PDFs keep
 * the version they were signed under.
 *
 * Drafted for review by a lawyer licensed in the Maldives before relying on it.
 */
export const AGREEMENT_VERSION = "2026-11-v1";

export type AgreementSection = { title: string; clauses: string[] };

export const AGREEMENT_LAWS = [
  "Penal Code of the Maldives (Law No. 6/2014)",
  "Land Transport Act (Law No. 5/2009) and the regulations made under it",
  "Contract Act (Law No. 4/91)",
];

export const AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    title: "1. The rental",
    clauses: [
      "EasyRide rents the vehicle described in this agreement to the Rider for the rental period stated, for the Rider's own private use in Kulhudhuffushi.",
      "The Rider confirms that the details they gave are true, that they are at least 18 years old, and that they hold a valid driving licence of the category this vehicle needs (A for motorcycles and scooters, B for cars) for the whole rental period.",
      "Only the Rider may ride or drive the vehicle. The Rider must not lend, sub-rent or hand it to anyone else, use it for hire, deliveries, racing or any other commercial purpose, or take it off Kulhudhuffushi without EasyRide's written consent.",
    ],
  },
  {
    title: "2. Obeying the law",
    clauses: [
      "The Rider must obey the Land Transport Act (Law No. 5/2009), the regulations made under it, and every other law of the Maldives while the vehicle is in their care, including rules on licences, speed, helmets, passengers, parking, and riding or driving under the influence of alcohol or drugs.",
      "The Rider must not use the vehicle to commit, help commit or escape from any offence under the Penal Code of the Maldives (Law No. 6/2014) or any other law.",
    ],
  },
  {
    title: "3. The Rider's responsibility for offences",
    clauses: [
      "From handover until EasyRide has the vehicle back, the Rider alone is responsible for every traffic offence, fine, penalty, parking charge, towing or impound fee, and for any criminal act or other offence committed by the Rider or by anyone using the vehicle with the Rider's permission or because of the Rider's negligence.",
      "The Rider must pay these fines and charges when they are due. If they are charged to EasyRide as the vehicle's owner, the Rider must repay EasyRide in full together with any reasonable cost of handling them, and EasyRide may take the amount from the deposit.",
      "EasyRide will cooperate with the Maldives Police Service, the Transport Authority and the courts, and may give them the Rider's name, identity and licence details and this agreement to identify who was in charge of the vehicle.",
    ],
  },
  {
    title: "4. Accidents, damage, loss and theft",
    clauses: [
      "The Rider must tell the police and EasyRide straight away about any accident, injury, damage, loss or theft, and must not admit liability to anyone or arrange repairs without EasyRide's consent.",
      "The Rider is responsible for damage to the vehicle and its accessories, and for its loss or theft, during the rental period, apart from normal wear and tear. The amount is the reasonable repair or replacement cost and loss of rental while it is off the road, as set out in EasyRide's damage review.",
      "The Rider is responsible for damage, injury or loss caused to other people or property by the Rider's use of the vehicle, and will indemnify EasyRide against claims made against it because of that use.",
    ],
  },
  {
    title: "5. EasyRide's responsibility",
    clauses: [
      "EasyRide hands over the vehicle in roadworthy condition, as recorded in the photos and readings in this agreement.",
      "As far as the law of the Maldives allows, EasyRide is not responsible for any fine, penalty, criminal liability, injury, loss or damage arising from the Rider's use of the vehicle during the rental period. This does not limit EasyRide's liability for its own negligence, for a defect it knew of and did not disclose, or for anything the law does not allow to be excluded.",
    ],
  },
  {
    title: "6. Return, fees and deposit",
    clauses: [
      "The Rider must return the vehicle by the end of the rental period, at the agreed place, with the same fuel level and in the same condition apart from normal wear and tear.",
      "Late returns are charged for each started hour after a short grace period at the vehicle's late rate, up to one day's rent for each 24 hours. Missing fuel, cleaning beyond normal use and lost keys or accessories are charged at cost.",
      "Any refundable deposit is returned after the vehicle is checked, less amounts the Rider owes under this agreement.",
    ],
  },
  {
    title: "7. General",
    clauses: [
      "This agreement, the rental terms the Rider accepted when booking and the handover record form the whole agreement. If any part is found unenforceable, the rest remains in force.",
      "The parties sign this agreement electronically on screen at handover and agree that these signatures bind them in the same way as handwritten signatures. Each party receives a copy.",
      "This agreement is governed by the laws of the Republic of Maldives, including the Contract Act (Law No. 4/91), and disputes are decided by the courts of the Maldives.",
    ],
  },
];

/** The points staff read out at handover, before the rider signs. */
export const AGREEMENT_SUMMARY = [
  "Only you ride or drive it, with a valid licence of the right category, and you keep it in Kulhudhuffushi.",
  "You obey the Land Transport Act and all Maldivian laws while it is in your care.",
  "You alone are responsible for every fine, traffic offence and any criminal act during the rental; fines sent to EasyRide are charged to you.",
  "You report accidents, damage or theft to the police and us at once, and you pay for damage, loss or theft (normal wear excepted).",
  "Return it on time, with the same fuel; late hours are charged.",
];
