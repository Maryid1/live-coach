import React from 'react';
import { createRoot } from 'react-dom/client';
import CoachApp from '../app/coach-app';
import '../app/coach.css';
createRoot(document.getElementById('root')!).render(<CoachApp selfHosted />);
