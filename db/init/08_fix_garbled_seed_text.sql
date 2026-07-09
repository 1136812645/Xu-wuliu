USE waybill_admin;

SET NAMES utf8mb4;

-- Repair known seed records with byte-level values to avoid terminal/client encoding issues.
UPDATE vehicle
SET plate_no = CONVERT(UNHEX('E6B2AA413132333435') USING utf8mb4)
WHERE id = 'vehicle-1'
	AND HEX(plate_no) <> 'E6B2AA413132333435';

UPDATE vehicle
SET plate_no = CONVERT(UNHEX('E88B8F423939383831') USING utf8mb4)
WHERE id = 'vehicle-2'
	AND HEX(plate_no) <> 'E88B8F423939383831';

UPDATE vehicle
SET plate_no = CONVERT(UNHEX('E6B599433737383839') USING utf8mb4)
WHERE id = 'vehicle-3'
	AND HEX(plate_no) <> 'E6B599433737383839';

UPDATE driver
SET name = CONVERT(UNHEX('E69D8EE6988E') USING utf8mb4)
WHERE id = 'driver-1'
	AND HEX(name) <> 'E69D8EE6988E';

UPDATE shipper
SET name = CONVERT(UNHEX('E58D8EE4B89CE5AEB6E794B5') USING utf8mb4),
		contact_name = CONVERT(UNHEX('E78E8BE4B8BD') USING utf8mb4)
WHERE id = 'shipper-1'
	AND (
		HEX(name) <> 'E58D8EE4B89CE5AEB6E794B5'
		OR HEX(contact_name) <> 'E78E8BE4B8BD'
	);

UPDATE carrier
SET name = CONVERT(UNHEX('E8BF9CE8BEBEE5B9B2E7BABF') USING utf8mb4),
		contact_name = CONVERT(UNHEX('E99988E9948B') USING utf8mb4)
WHERE id = 'carrier-1'
	AND (
		HEX(name) <> 'E8BF9CE8BEBEE5B9B2E7BABF'
		OR HEX(contact_name) <> 'E99988E9948B'
	);
