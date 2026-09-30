CREATE TABLE "CertificateSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "email" TEXT NOT NULL DEFAULT 'navreet@sanc.in',
    "calibratedByName" TEXT NOT NULL DEFAULT 'Priyanshu Surti',
    "calibratedBySignature" TEXT,
    "approvedByName" TEXT NOT NULL DEFAULT 'Nitesh Yadav',
    "approvedBySignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CertificateSettings" (
    "id",
    "email",
    "calibratedByName",
    "approvedByName",
    "updatedAt"
) VALUES (
    1, 'navreet@sanc.in', 'Priyanshu Surti', 'Nitesh Yadav', CURRENT_TIMESTAMP
);
