export type Issue = {

  id: string;              // same as sem_header (title)
  name: string;            // sem_header
  description?: string;    // sem_long_description
  recommendations?: string[]; // sem_recommendations
  reference?: string;      // first URL from sem_resolution_instruction
  severityScore?: number;  // severity_score
  category?: string;       // sem_category

};
