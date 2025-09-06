export type Issue = {
  id: string;
  name: string;
  description?: string;
  recommendations?: string[];
  reference?: string;
  severityScore?: number;
  /** New: from sem_template.sem_category */
  category?: string;
};
