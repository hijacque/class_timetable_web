-- MySQL dump 10.13  Distrib 8.0.31, for macos12.6 (arm64)
--
-- Host: localhost    Database: class_sched_sys
-- ------------------------------------------------------
-- Server version	8.0.31

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `Blocks`
--

DROP TABLE IF EXISTS `Blocks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Blocks` (
  `id` varchar(8) NOT NULL,
  `course_id` varchar(8) DEFAULT NULL,
  `term_id` varchar(8) DEFAULT NULL,
  `year` int unsigned DEFAULT NULL,
  `block_no` int unsigned DEFAULT '1',
  `total_students` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `term_id` (`term_id`),
  KEY `course_id` (`course_id`),
  CONSTRAINT `blocks_ibfk_2` FOREIGN KEY (`course_id`) REFERENCES `Courses` (`id`),
  CONSTRAINT `blocks_ibfk_3` FOREIGN KEY (`term_id`) REFERENCES `Terms` (`id`),
  CONSTRAINT `blocks_ibfk_4` FOREIGN KEY (`course_id`) REFERENCES `Courses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Buildings`
--

DROP TABLE IF EXISTS `Buildings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Buildings` (
  `id` varchar(8) NOT NULL,
  `school_id` varchar(12) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `school_id` (`school_id`),
  CONSTRAINT `buildings_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `Schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Colleges`
--

DROP TABLE IF EXISTS `Colleges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Colleges` (
  `id` varchar(8) NOT NULL,
  `school_id` varchar(12) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `school_id` (`school_id`),
  CONSTRAINT `colleges_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `Schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Courses`
--

DROP TABLE IF EXISTS `Courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Courses` (
  `id` varchar(8) NOT NULL,
  `dept_id` varchar(8) DEFAULT NULL,
  `title` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `dept_id` (`dept_id`),
  CONSTRAINT `courses_ibfk_1` FOREIGN KEY (`dept_id`) REFERENCES `Departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Curricula`
--

DROP TABLE IF EXISTS `Curricula`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Curricula` (
  `course_id` varchar(8) DEFAULT NULL,
  `subj_id` varchar(8) DEFAULT NULL,
  `year` int unsigned DEFAULT NULL,
  `term` char(1) DEFAULT NULL,
  KEY `course_id` (`course_id`),
  KEY `subj_id` (`subj_id`),
  CONSTRAINT `curricula_ibfk_1` FOREIGN KEY (`course_id`) REFERENCES `Courses` (`id`),
  CONSTRAINT `curricula_ibfk_2` FOREIGN KEY (`subj_id`) REFERENCES `Subjects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Departments`
--

DROP TABLE IF EXISTS `Departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Departments` (
  `id` varchar(8) NOT NULL,
  `college_id` varchar(8) DEFAULT NULL,
  `chair_id` varchar(12) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `college_id` (`college_id`),
  CONSTRAINT `departments_ibfk_1` FOREIGN KEY (`college_id`) REFERENCES `Colleges` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Faculty`
--

DROP TABLE IF EXISTS `Faculty`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Faculty` (
  `id` varchar(12) DEFAULT NULL,
  `dept_id` varchar(8) DEFAULT NULL,
  `faculty_id` varchar(50) NOT NULL,
  `first_name` varchar(70) NOT NULL,
  `middle_name` varchar(40) DEFAULT NULL,
  `last_name` varchar(40) NOT NULL,
  `status` enum('full-time','part-time') DEFAULT NULL,
  `teach_load` int unsigned DEFAULT NULL,
  KEY `id` (`id`),
  KEY `dept_id` (`dept_id`),
  CONSTRAINT `faculty_ibfk_1` FOREIGN KEY (`id`) REFERENCES `Users` (`id`),
  CONSTRAINT `faculty_ibfk_2` FOREIGN KEY (`dept_id`) REFERENCES `Departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `OTPs`
--

DROP TABLE IF EXISTS `OTPs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `OTPs` (
  `email` varchar(100) DEFAULT NULL,
  `pin` varchar(64) DEFAULT NULL,
  `pin_salt` varchar(32) DEFAULT NULL,
  `expires_on` datetime DEFAULT NULL,
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Preferences`
--

DROP TABLE IF EXISTS `Preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Preferences` (
  `term_id` varchar(8) DEFAULT NULL,
  `faculty_id` varchar(12) DEFAULT NULL,
  `assigned_load` int unsigned DEFAULT '0',
  `status` enum('pending','submitted','unanswered','closed') DEFAULT 'pending',
  `id` varchar(8) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `term_id` (`term_id`),
  KEY `faculty_id` (`faculty_id`),
  CONSTRAINT `preferences_ibfk_1` FOREIGN KEY (`term_id`) REFERENCES `Terms` (`id`),
  CONSTRAINT `preferences_ibfk_2` FOREIGN KEY (`faculty_id`) REFERENCES `Faculty` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `PrefSchedules`
--

DROP TABLE IF EXISTS `PrefSchedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `PrefSchedules` (
  `pref_id` varchar(8) DEFAULT NULL,
  `day` int unsigned DEFAULT NULL,
  `start` int unsigned DEFAULT NULL,
  `end` int unsigned DEFAULT NULL,
  KEY `pref_id` (`pref_id`),
  CONSTRAINT `prefschedules_ibfk_1` FOREIGN KEY (`pref_id`) REFERENCES `Preferences` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `PrefSubjects`
--

DROP TABLE IF EXISTS `PrefSubjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `PrefSubjects` (
  `pref_id` varchar(8) DEFAULT NULL,
  `subj_id` varchar(8) DEFAULT NULL,
  KEY `pref_id` (`pref_id`),
  KEY `subj_id` (`subj_id`),
  CONSTRAINT `prefsubjects_ibfk_1` FOREIGN KEY (`pref_id`) REFERENCES `Preferences` (`id`),
  CONSTRAINT `prefsubjects_ibfk_2` FOREIGN KEY (`subj_id`) REFERENCES `Subjects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Rooms`
--

DROP TABLE IF EXISTS `Rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Rooms` (
  `bldg_id` varchar(8) DEFAULT NULL,
  `id` varchar(8) NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `level` char(1) DEFAULT NULL,
  `capacity` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bldg_id` (`bldg_id`),
  CONSTRAINT `rooms_ibfk_1` FOREIGN KEY (`bldg_id`) REFERENCES `Buildings` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Schedules`
--

DROP TABLE IF EXISTS `Schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Schedules` (
  `term_id` varchar(8) DEFAULT NULL,
  `subj_id` varchar(8) DEFAULT NULL,
  `block_id` varchar(8) DEFAULT NULL,
  `faculty_id` varchar(12) DEFAULT NULL,
  `room_id` varchar(8) DEFAULT NULL,
  `day` int unsigned DEFAULT NULL,
  `start` int unsigned DEFAULT NULL,
  `end` int unsigned DEFAULT NULL,
  `mode` enum('F2F','Online','Blended') DEFAULT NULL,
  KEY `term_id` (`term_id`),
  KEY `subj_id` (`subj_id`),
  KEY `block_id` (`block_id`),
  KEY `faculty_id` (`faculty_id`),
  KEY `room_id` (`room_id`),
  CONSTRAINT `schedules_ibfk_1` FOREIGN KEY (`term_id`) REFERENCES `Terms` (`id`),
  CONSTRAINT `schedules_ibfk_2` FOREIGN KEY (`subj_id`) REFERENCES `Subjects` (`id`),
  CONSTRAINT `schedules_ibfk_3` FOREIGN KEY (`block_id`) REFERENCES `Blocks` (`id`),
  CONSTRAINT `schedules_ibfk_4` FOREIGN KEY (`faculty_id`) REFERENCES `Faculty` (`id`),
  CONSTRAINT `schedules_ibfk_5` FOREIGN KEY (`room_id`) REFERENCES `Rooms` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Schools`
--

DROP TABLE IF EXISTS `Schools`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Schools` (
  `id` varchar(12) DEFAULT NULL,
  `name` varchar(120) NOT NULL,
  `total_terms_yearly` int DEFAULT NULL,
  UNIQUE KEY `id` (`id`),
  UNIQUE KEY `id_2` (`id`),
  CONSTRAINT `schools_ibfk_1` FOREIGN KEY (`id`) REFERENCES `Users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Subjects`
--

DROP TABLE IF EXISTS `Subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Subjects` (
  `id` varchar(8) NOT NULL,
  `college_id` varchar(8) DEFAULT NULL,
  `code` varchar(30) NOT NULL,
  `title` varchar(100) NOT NULL,
  `type` enum('LEC','LAB') DEFAULT NULL,
  `units` int unsigned DEFAULT NULL,
  `req_hours` int unsigned DEFAULT NULL,
  `pref_rooms` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `college_id` (`college_id`),
  CONSTRAINT `subjects_ibfk_1` FOREIGN KEY (`college_id`) REFERENCES `Colleges` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Terms`
--

DROP TABLE IF EXISTS `Terms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Terms` (
  `id` varchar(8) NOT NULL,
  `school_id` varchar(12) DEFAULT NULL,
  `year` int unsigned NOT NULL,
  `term` char(1) NOT NULL,
  `status` enum('open','complete','closed') DEFAULT NULL,
  `created_on` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `school_id` (`school_id`),
  CONSTRAINT `terms_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `Schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Users`
--

DROP TABLE IF EXISTS `Users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Users` (
  `id` varchar(12) NOT NULL,
  `type` enum('admin','chair','faculty') DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(64) DEFAULT NULL,
  `pass_salt` varchar(32) DEFAULT NULL,
  `opened_on` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2023-04-30 21:51:40
