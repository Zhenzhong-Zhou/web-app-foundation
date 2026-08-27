import { IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyEmailDto {
  // 32 bytes base64url is 43 characters. Bounded so a megabyte of junk is
  // rejected before it reaches a hash and a database round trip.
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}
