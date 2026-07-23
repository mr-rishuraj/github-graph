import React from 'react';
import { useTheme } from './useTheme';
import styles from './Button.module.css';
import type { ButtonProps } from './types';

export default function Button({ label, onClick }: ButtonProps) {
  const { theme } = useTheme();
  return <button className={styles.btn} data-theme={theme} onClick={onClick}>{label}</button>;
}

export function PrimaryButton(props: ButtonProps) {
  return <Button {...props} />;
}
