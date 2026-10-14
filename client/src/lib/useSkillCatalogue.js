import { useEffect, useState } from 'react';
import { api } from './api';

let cachedSkills = null;
let cachedTypes = null;
let skillsInflight = null;
let typesInflight = null;

async function fetchSkills() {
  if (cachedSkills) return cachedSkills;
  if (typeof api.get !== 'function') return [];
  skillsInflight = skillsInflight || api.get('/skills')
    .then((d) => {
      cachedSkills = d.skills || [];
      return cachedSkills;
    })
    .catch(() => {
      skillsInflight = null;
      return [];
    });
  return skillsInflight;
}

async function fetchJobTypes() {
  if (cachedTypes) return cachedTypes;
  if (typeof api.get !== 'function') return [];
  typesInflight = typesInflight || api.get('/job-types')
    .then((d) => {
      cachedTypes = d.job_types || [];
      return cachedTypes;
    })
    .catch(() => {
      typesInflight = null;
      return [];
    });
  return typesInflight;
}

export function useSkillCatalogue() {
  const [skills, setSkills] = useState(cachedSkills || []);
  const [jobTypes, setJobTypes] = useState(cachedTypes || []);

  useEffect(() => {
    let cancelled = false;
    fetchSkills().then((rows) => { if (!cancelled) setSkills(rows); });
    fetchJobTypes().then((rows) => { if (!cancelled) setJobTypes(rows); });
    return () => { cancelled = true; };
  }, []);

  return { skills, jobTypes };
}

export function resetSkillCatalogueCache() {
  cachedSkills = null;
  cachedTypes = null;
  skillsInflight = null;
  typesInflight = null;
}
