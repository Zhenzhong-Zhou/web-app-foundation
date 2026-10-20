import { Injectable } from '@nestjs/common';

import { HourlyTimer } from '../../common/hourly-timer';
import { InvitationsSweepService } from './invitations-sweep.service';

/** Sweeps the invitations, and organization invitations, ended 30 days ago (ADR-077, ADR-078). */
@Injectable()
export class InvitationsSweepTimer extends HourlyTimer {
  constructor(private readonly invitations: InvitationsSweepService) {
    super();
  }

  protected async run(): Promise<void> {
    const swept = await this.invitations.sweep();
    if (swept) this.logger.log(`Invitations: ${swept} swept`);
  }
}
