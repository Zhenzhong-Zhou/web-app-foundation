import { IsString, MaxLength, MinLength } from 'class-validator';

/** An invitation's link, read without spending it (ADR-077). */
export class InvitationTokenDto {
  // 32 bytes base64url is 43 characters, bounded as verification's is.
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}
