'use client';

import TanzaMode from '../components/TanzaMode';
import { motion } from 'framer-motion';

export default function TanzaPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="container mx-auto px-4 py-8"
    >
      <TanzaMode />
    </motion.div>
  );
} 