export const SEARCH_SYNONYMS: Record<string, string[]> = {
  "eye doctor": ["optometrist", "ophthalmologist", "optometry", "vision", "eye care", "eye exam"],
  "optometrist": ["eye doctor", "ophthalmologist", "optometry", "vision", "eye care"],
  "ophthalmologist": ["eye doctor", "optometrist", "optometry", "vision", "eye care"],
  "dentist": ["dental", "orthodontist", "oral", "teeth"],
  "dental": ["dentist", "orthodontist", "oral", "teeth"],
  "doctor": ["physician", "medical", "clinic", "healthcare", "family medicine", "primary care"],
  "therapist": ["therapy", "counselor", "counseling", "mental health", "psychologist"],
  "mental health": ["therapist", "therapy", "counselor", "counseling", "psychologist"],
  "lawyer": ["attorney", "legal", "law firm", "law office"],
  "attorney": ["lawyer", "legal", "law firm", "law office"],
  "realtor": ["real estate", "realty", "property", "home", "housing"],
  "real estate": ["realtor", "realty", "property", "home", "housing"],
  "mechanic": ["auto repair", "automotive", "car repair", "auto shop"],
  "auto repair": ["mechanic", "automotive", "car repair", "auto shop"],
  "accountant": ["accounting", "tax", "cpa", "bookkeeping", "financial"],
  "tax": ["accountant", "accounting", "cpa", "tax preparation"],
  "insurance": ["auto insurance", "health insurance", "life insurance", "coverage"],
  "contractor": ["contracting", "construction", "builder", "remodeling", "renovation"],
  "construction": ["contractor", "contracting", "builder", "remodeling"],
  "plumber": ["plumbing", "pipes", "drain"],
  "electrician": ["electrical", "wiring"],
  "tutor": ["tutoring", "education", "learning", "teaching"],
  "daycare": ["childcare", "child care", "preschool", "nursery"],
  "barber": ["barbershop", "haircut", "men's grooming"],
  "salon": ["hair salon", "beauty", "styling", "hairdresser"],
  "restaurant": ["food", "dining", "eatery", "cafe"],
  "grocery": ["groceries", "supermarket", "market", "food store"],
  "halal": ["zabiha", "halal-certified", "halal meat"],
  "zabiha": ["halal", "halal-certified", "halal meat"],
  "wedding": ["bridal", "nikah", "marriage", "wedding planner"],
  "photographer": ["photography", "photo", "portrait"],
  "photography": ["photographer", "photo", "portrait"],
};

export function expandSearchTerms(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return [q, ...(SEARCH_SYNONYMS[q] || [])];
}