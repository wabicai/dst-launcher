import type { ProjectStatus } from '@dst-launcher/shared';
import { Badge } from './ui/badge';

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge value={status} />;
}
