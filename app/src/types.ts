export type Issue = {
<<<<<<< HEAD
  id: string;
  name: string;
  description?: string;
  recommendations?: string[];
  reference?: string;
  severityScore?: number;
  /** New: from sem_template.sem_category */
  category?: string;
=======
  id: string;              // same as sem_header (title)
  name: string;            // sem_header
  description?: string;    // sem_long_description
  recommendations?: string[]; // sem_recommendations
  reference?: string;      // first URL from sem_resolution_instruction
  severityScore?: number;  // severity_score
  category?: string;       // sem_category
>>>>>>> 8698c50 (Add Settings table with kebab menu (Edit/Delete) and server API for issues)
};
