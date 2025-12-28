SELECT
    COALESCE(c.first_name, '') AS "First Name",
    COALESCE(c.last_name, '') AS "Last Name",
    COALESCE(cl.business_name, '') AS "Company",
    COALESCE(c.phone, '') AS "Phone",
    COALESCE(c.email, '') AS "Email",
    'ringlypro-ai-lead' AS "Tags"
FROM contacts c
LEFT JOIN clients cl ON c.client_id = cl.id
ORDER BY cl.business_name, c.created_at DESC;
