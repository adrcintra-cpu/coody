const vercel = process.env.NEXT_PUBLIC_COODY_HOSTING === 'vercel';
export const assetLimitMB = vercel ? 4 : 20;
export const avatarLimitMB = vercel ? 4 : 5;
export const onboardingLimitMB = vercel ? 4 : 25;
