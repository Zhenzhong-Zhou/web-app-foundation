import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { PERMISSIONS } from '../authorization/permissions';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Viewer holds users.view, so this is readable by every member. The
  // permission still gates it, because a future role need not.
  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  list() {
    return this.users.listMembers();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  async create(@Body() dto: CreateUserDto) {
    return { user: await this.users.create(dto) };
  }
}
