import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HakkenEmptyState from './HakkenEmptyState';

describe('HakkenEmptyState Component', () => {
  it('renders title and description properly', () => {
    render(<HakkenEmptyState title="No Users Found" description="Try adjusting your search filters." />);
    
    expect(screen.getByText('No Users Found')).toBeDefined();
    expect(screen.getByText('Try adjusting your search filters.')).toBeDefined();
  });

  it('renders action button if provided', () => {
    const actionNode = <button data-testid="mock-action">Click Me</button>;
    
    render(
      <HakkenEmptyState 
        title="Empty" 
        description="Nothing here" 
        action={actionNode} 
      />
    );
    
    expect(screen.getByTestId('mock-action')).toBeDefined();
  });
});
