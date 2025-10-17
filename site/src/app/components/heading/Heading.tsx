import { ReactElement } from 'react';

type HeadingProps = {
  headingLevel: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  className?: string;
  children: ReactElement;
};

export const Heading = ({ headingLevel, className, children }: HeadingProps) => {
  const DynamicHeading = headingLevel;

  return <DynamicHeading className={className}>{children}</DynamicHeading>;
};
