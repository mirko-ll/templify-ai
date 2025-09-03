-- ===============================================
-- METABASE ANALYTICS QUERIES FOR TEMPLAITO
-- ===============================================

-- -----------------------------------------------
-- 1. BASIC USAGE STATISTICS
-- -----------------------------------------------

-- Total Usage Count
SELECT COUNT(*) as total_usage_count
FROM TemplateUsage;

-- Total Usage Count by Success Status
SELECT 
    wasSuccessful,
    COUNT(*) as usage_count,
    ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM TemplateUsage)), 2) as percentage
FROM TemplateUsage 
GROUP BY wasSuccessful;

-- Total Successful vs Failed Usage
SELECT 
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    SUM(CASE WHEN wasSuccessful = 0 THEN 1 ELSE 0 END) as failed_usage,
    COUNT(*) as total_usage,
    ROUND((SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate_percentage
FROM TemplateUsage;

-- -----------------------------------------------
-- 2. TEMPLATE USAGE ANALYTICS
-- -----------------------------------------------

-- Usage by Template Type
SELECT 
    templateType,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    ROUND((SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate_percentage,
    AVG(urlCount) as avg_urls_per_usage
FROM TemplateUsage 
GROUP BY templateType 
ORDER BY usage_count DESC;

-- Usage by Specific Template ID
SELECT 
    templateId,
    templateType,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    ROUND((SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate_percentage,
    AVG(urlCount) as avg_urls_per_usage
FROM TemplateUsage 
GROUP BY templateId, templateType 
ORDER BY usage_count DESC;

-- Most Popular Templates (Combined Type + ID)
SELECT 
    CONCAT(templateType, ' - Template ', templateId) as template_name,
    templateType,
    templateId,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    ROUND((SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate_percentage
FROM TemplateUsage 
GROUP BY templateType, templateId 
ORDER BY usage_count DESC;

-- -----------------------------------------------
-- 3. USER ANALYTICS
-- -----------------------------------------------

-- Usage per User (Registered Users Only)
SELECT 
    u.id as user_id,
    u.name,
    u.email,
    COUNT(tu.id) as total_usage_count,
    SUM(CASE WHEN tu.wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    ROUND((SUM(CASE WHEN tu.wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(tu.id)), 2) as success_rate_percentage,
    SUM(tu.urlCount) as total_urls_processed,
    AVG(tu.urlCount) as avg_urls_per_usage,
    MAX(tu.createdAt) as last_usage_date,
    MIN(tu.createdAt) as first_usage_date
FROM User u
LEFT JOIN TemplateUsage tu ON u.id = tu.userId
WHERE tu.id IS NOT NULL
GROUP BY u.id, u.name, u.email
ORDER BY total_usage_count DESC;

-- Top 10 Most Active Users
SELECT 
    u.name,
    u.email,
    COUNT(tu.id) as usage_count,
    SUM(CASE WHEN tu.wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage
FROM User u
LEFT JOIN TemplateUsage tu ON u.id = tu.userId
WHERE tu.id IS NOT NULL
GROUP BY u.id, u.name, u.email
ORDER BY usage_count DESC
LIMIT 10;

-- Anonymous vs Registered User Usage
SELECT 
    CASE 
        WHEN userId IS NULL THEN 'Anonymous'
        ELSE 'Registered'
    END as user_type,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    ROUND((SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate_percentage
FROM TemplateUsage
GROUP BY CASE WHEN userId IS NULL THEN 'Anonymous' ELSE 'Registered' END;

-- -----------------------------------------------
-- 4. GEOGRAPHIC ANALYTICS
-- -----------------------------------------------

-- Usage by Country
SELECT 
    COALESCE(userCountry, 'Unknown') as country,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    ROUND((SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate_percentage,
    AVG(urlCount) as avg_urls_per_usage
FROM TemplateUsage 
GROUP BY userCountry 
ORDER BY usage_count DESC;

-- Top 10 Countries by Usage
SELECT 
    COALESCE(userCountry, 'Unknown') as country,
    COUNT(*) as usage_count,
    ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM TemplateUsage)), 2) as percentage_of_total
FROM TemplateUsage 
GROUP BY userCountry 
ORDER BY usage_count DESC
LIMIT 10;

-- -----------------------------------------------
-- 5. INDUSTRY ANALYTICS
-- -----------------------------------------------

-- Usage by Industry
SELECT 
    COALESCE(userIndustry, 'Unknown') as industry,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    ROUND((SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate_percentage,
    AVG(urlCount) as avg_urls_per_usage
FROM TemplateUsage 
GROUP BY userIndustry 
ORDER BY usage_count DESC;

-- Template Preferences by Industry
SELECT 
    COALESCE(userIndustry, 'Unknown') as industry,
    templateType,
    COUNT(*) as usage_count,
    ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY userIndustry)), 2) as percentage_within_industry
FROM TemplateUsage 
GROUP BY userIndustry, templateType 
ORDER BY userIndustry, usage_count DESC;

-- -----------------------------------------------
-- 6. COMPANY SIZE ANALYTICS
-- -----------------------------------------------

-- Usage by Company Size
SELECT 
    COALESCE(userCompanySize, 'Unknown') as company_size,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    ROUND((SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate_percentage,
    AVG(urlCount) as avg_urls_per_usage
FROM TemplateUsage 
GROUP BY userCompanySize 
ORDER BY usage_count DESC;

-- Template Preferences by Company Size
SELECT 
    COALESCE(userCompanySize, 'Unknown') as company_size,
    templateType,
    COUNT(*) as usage_count,
    ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY userCompanySize)), 2) as percentage_within_company_size
FROM TemplateUsage 
GROUP BY userCompanySize, templateType 
ORDER BY userCompanySize, usage_count DESC;

-- -----------------------------------------------
-- 7. TIME-BASED ANALYTICS
-- -----------------------------------------------

-- Usage by Date (Daily)
SELECT 
    DATE(createdAt) as usage_date,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    COUNT(DISTINCT userId) as unique_users,
    SUM(urlCount) as total_urls_processed
FROM TemplateUsage 
GROUP BY DATE(createdAt) 
ORDER BY usage_date DESC;

-- Usage by Month
SELECT 
    YEAR(createdAt) as year,
    MONTH(createdAt) as month,
    MONTHNAME(createdAt) as month_name,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    COUNT(DISTINCT userId) as unique_users,
    SUM(urlCount) as total_urls_processed
FROM TemplateUsage 
GROUP BY YEAR(createdAt), MONTH(createdAt), MONTHNAME(createdAt)
ORDER BY year DESC, month DESC;

-- Usage by Hour of Day
SELECT 
    HOUR(createdAt) as hour_of_day,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    ROUND((SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate_percentage
FROM TemplateUsage 
GROUP BY HOUR(createdAt) 
ORDER BY hour_of_day;

-- Usage by Day of Week
SELECT 
    DAYNAME(createdAt) as day_of_week,
    DAYOFWEEK(createdAt) as day_number,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    ROUND((SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate_percentage
FROM TemplateUsage 
GROUP BY DAYNAME(createdAt), DAYOFWEEK(createdAt) 
ORDER BY day_number;

-- -----------------------------------------------
-- 8. URL PROCESSING ANALYTICS
-- -----------------------------------------------

-- URL Count Distribution
SELECT 
    urlCount,
    COUNT(*) as usage_count,
    ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM TemplateUsage)), 2) as percentage
FROM TemplateUsage 
GROUP BY urlCount 
ORDER BY urlCount;

-- Average URLs by Template Type
SELECT 
    templateType,
    AVG(urlCount) as avg_urls_per_usage,
    MIN(urlCount) as min_urls,
    MAX(urlCount) as max_urls,
    SUM(urlCount) as total_urls_processed
FROM TemplateUsage 
GROUP BY templateType 
ORDER BY avg_urls_per_usage DESC;

-- Single vs Multiple URL Usage
SELECT 
    CASE 
        WHEN urlCount = 1 THEN 'Single URL'
        ELSE 'Multiple URLs'
    END as url_type,
    COUNT(*) as usage_count,
    SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) as successful_usage,
    ROUND((SUM(CASE WHEN wasSuccessful = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as success_rate_percentage,
    AVG(urlCount) as avg_urls_per_usage
FROM TemplateUsage 
GROUP BY CASE WHEN urlCount = 1 THEN 'Single URL' ELSE 'Multiple URLs' END;

-- -----------------------------------------------
-- 9. COHORT & RETENTION ANALYTICS
-- -----------------------------------------------

-- New vs Returning Users (Monthly Cohort)
SELECT 
    DATE_FORMAT(tu.createdAt, '%Y-%m') as month,
    COUNT(DISTINCT tu.userId) as total_users,
    COUNT(DISTINCT CASE 
        WHEN tu.createdAt = (
            SELECT MIN(createdAt) 
            FROM TemplateUsage tu2 
            WHERE tu2.userId = tu.userId
        ) THEN tu.userId 
    END) as new_users,
    COUNT(DISTINCT CASE 
        WHEN tu.createdAt != (
            SELECT MIN(createdAt) 
            FROM TemplateUsage tu2 
            WHERE tu2.userId = tu.userId
        ) THEN tu.userId 
    END) as returning_users
FROM TemplateUsage tu
WHERE tu.userId IS NOT NULL
GROUP BY DATE_FORMAT(tu.createdAt, '%Y-%m')
ORDER BY month DESC;

-- -----------------------------------------------
-- 10. COMPREHENSIVE DASHBOARD SUMMARY
-- -----------------------------------------------

-- Executive Summary (Single Query for Dashboard Overview)
SELECT 
    (SELECT COUNT(*) FROM TemplateUsage) as total_usage,
    (SELECT COUNT(*) FROM TemplateUsage WHERE wasSuccessful = 1) as successful_usage,
    (SELECT ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM TemplateUsage)), 2) FROM TemplateUsage WHERE wasSuccessful = 1) as success_rate,
    (SELECT COUNT(DISTINCT userId) FROM TemplateUsage WHERE userId IS NOT NULL) as total_registered_users,
    (SELECT COUNT(*) FROM TemplateUsage WHERE userId IS NULL) as anonymous_usage,
    (SELECT COUNT(DISTINCT templateType) FROM TemplateUsage) as unique_template_types,
    (SELECT AVG(urlCount) FROM TemplateUsage) as avg_urls_per_usage,
    (SELECT SUM(urlCount) FROM TemplateUsage) as total_urls_processed,
    (SELECT COUNT(DISTINCT userCountry) FROM TemplateUsage WHERE userCountry IS NOT NULL) as countries_served,
    (SELECT COUNT(DISTINCT userIndustry) FROM TemplateUsage WHERE userIndustry IS NOT NULL) as industries_served;