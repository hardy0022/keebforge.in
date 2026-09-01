-- Add the Invitation -> User (inviter) relation so the Dash organization
-- member-list query can join `user` onto invitations (and members). Without it,
-- Prisma throws "Unknown field 'user'" and the Members tab renders empty.

-- CreateIndex
CREATE INDEX "invitation_inviterId_idx" ON "invitation"("inviterId");

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
