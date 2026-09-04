-- Telangana's sub-district revenue unit is the mandal. Renaming the value
-- rather than adding one keeps the enum a closed set and carries any rows
-- that already use it, so no data migration is needed alongside this.
ALTER TYPE "AddressLevel" RENAME VALUE 'TALUK' TO 'MANDAL';
