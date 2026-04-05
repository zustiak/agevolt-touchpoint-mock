-- SQLTools · AgeVolt prod — po pripojení spusti celý blok (Run on active connection)
SELECT VERSION() AS mysql_version, DATABASE() AS current_schema, NOW(3) AS server_time;
