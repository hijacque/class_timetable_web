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
  `dept_id` varchar(8) DEFAULT NULL,
  `course_id` varchar(8) DEFAULT NULL,
  `year` int DEFAULT NULL,
  `block` int DEFAULT NULL,
  `total_students` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `dept_id` (`dept_id`),
  KEY `course_id` (`course_id`),
  CONSTRAINT `blocks_ibfk_1` FOREIGN KEY (`dept_id`) REFERENCES `Departments` (`id`),
  CONSTRAINT `blocks_ibfk_2` FOREIGN KEY (`course_id`) REFERENCES `Courses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `chairpersons`
--

DROP TABLE IF EXISTS `chairpersons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chairpersons` (
  `div_id` varchar(8) DEFAULT NULL,
  `last_name` varchar(50) DEFAULT NULL,
  `first_name` varchar(50) DEFAULT NULL,
  `middle_name` varchar(50) DEFAULT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(64) NOT NULL,
  `pass_salt` varchar(32) NOT NULL,
  `acc_status` enum('pending','open') DEFAULT 'pending',
  `opened_on` datetime DEFAULT NULL,
  UNIQUE KEY `email` (`email`),
  KEY `dept_id` (`div_id`),
  CONSTRAINT `chairpersons_ibfk_1` FOREIGN KEY (`div_id`) REFERENCES `Departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `colleges`
--

DROP TABLE IF EXISTS `colleges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `colleges` (
  `id` varchar(8) NOT NULL,
  `school_id` varchar(12) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
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
  `title` varchar(150) NOT NULL,
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
  `subject_id` varchar(12) DEFAULT NULL,
  `year` int DEFAULT NULL,
  `term` char(1) DEFAULT NULL,
  KEY `course_id` (`course_id`),
  KEY `subject_id` (`subject_id`),
  CONSTRAINT `curricula_ibfk_1` FOREIGN KEY (`course_id`) REFERENCES `Courses` (`id`),
  CONSTRAINT `curricula_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `Subjects` (`id`)
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
  `name` varchar(150) NOT NULL,
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
  `id` varchar(8) NOT NULL,
  `dept_id` varchar(8) DEFAULT NULL,
  `last_name` varchar(50) NOT NULL,
  `first_name` varchar(50) NOT NULL,
  `middle_name` varchar(50) DEFAULT NULL,
  `email` varchar(150) NOT NULL,
  `teaching_load` int DEFAULT NULL,
  `emp_status` enum('full-time','part-time') NOT NULL,
  PRIMARY KEY (`id`),
  KEY `dept_id` (`dept_id`),
  CONSTRAINT `faculty_ibfk_1` FOREIGN KEY (`dept_id`) REFERENCES `Departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `OTPs`
--

DROP TABLE IF EXISTS `OTPs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `OTPs` (
  `email` varchar(100) NOT NULL,
  `pin` varchar(64) DEFAULT NULL,
  `expires_on` datetime DEFAULT NULL,
  `pin_salt` varchar(32) DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Preferences`
--

DROP TABLE IF EXISTS `Preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Preferences` (
  `id` varchar(8) NOT NULL,
  `term_id` varchar(8) DEFAULT NULL,
  `faculty_id` varchar(8) DEFAULT NULL,
  `subject_id` varchar(12) DEFAULT NULL,
  `opened_on` datetime DEFAULT CURRENT_TIMESTAMP,
  `expires_on` datetime NOT NULL,
  `submitted_on` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `term_id` (`term_id`),
  KEY `faculty_id` (`faculty_id`),
  CONSTRAINT `preferences_ibfk_1` FOREIGN KEY (`term_id`) REFERENCES `Terms` (`id`),
  CONSTRAINT `preferences_ibfk_2` FOREIGN KEY (`faculty_id`) REFERENCES `Faculty` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `PreferredExpertises`
--

DROP TABLE IF EXISTS `PreferredExpertises`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `PreferredExpertises` (
  `pref_id` varchar(8) DEFAULT NULL,
  `subject_id` varchar(12) DEFAULT NULL,
  KEY `pref_id` (`pref_id`),
  KEY `subject_id` (`subject_id`),
  CONSTRAINT `preferredexpertises_ibfk_1` FOREIGN KEY (`pref_id`) REFERENCES `Preferences` (`id`),
  CONSTRAINT `preferredexpertises_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `Subjects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `PreferredSchedules`
--

DROP TABLE IF EXISTS `PreferredSchedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `PreferredSchedules` (
  `pref_id` varchar(8) DEFAULT NULL,
  `day` int DEFAULT NULL,
  `start` time DEFAULT NULL,
  `end` time DEFAULT NULL,
  KEY `pref_id` (`pref_id`),
  CONSTRAINT `preferredschedules_ibfk_1` FOREIGN KEY (`pref_id`) REFERENCES `Preferences` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `PriorityRooms`
--

DROP TABLE IF EXISTS `PriorityRooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `PriorityRooms` (
  `subject_id` varchar(12) DEFAULT NULL,
  `room_id` varchar(8) DEFAULT NULL,
  KEY `subject_id` (`subject_id`),
  KEY `room_id` (`room_id`),
  CONSTRAINT `priorityrooms_ibfk_1` FOREIGN KEY (`subject_id`) REFERENCES `Subjects` (`id`),
  CONSTRAINT `priorityrooms_ibfk_2` FOREIGN KEY (`room_id`) REFERENCES `Rooms` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Rooms`
--

DROP TABLE IF EXISTS `Rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Rooms` (
  `id` varchar(8) NOT NULL,
  `school_id` varchar(12) DEFAULT NULL,
  `building` varchar(100) DEFAULT NULL,
  `code` varchar(50) NOT NULL,
  `capacity` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `school_id` (`school_id`),
  CONSTRAINT `rooms_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `Schools` (`id`)
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
  `block_id` varchar(8) DEFAULT NULL,
  `faculty_id` varchar(8) DEFAULT NULL,
  `subject_id` varchar(12) DEFAULT NULL,
  `room_id` varchar(12) DEFAULT NULL,
  `day` int DEFAULT NULL,
  `start` time DEFAULT NULL,
  `end` time DEFAULT NULL,
  KEY `term_id` (`term_id`),
  KEY `block_id` (`block_id`),
  KEY `faculty_id` (`faculty_id`),
  KEY `subject_id` (`subject_id`),
  KEY `room_id` (`room_id`),
  CONSTRAINT `schedules_ibfk_1` FOREIGN KEY (`term_id`) REFERENCES `Terms` (`id`),
  CONSTRAINT `schedules_ibfk_2` FOREIGN KEY (`block_id`) REFERENCES `Blocks` (`id`),
  CONSTRAINT `schedules_ibfk_3` FOREIGN KEY (`faculty_id`) REFERENCES `Faculty` (`id`),
  CONSTRAINT `schedules_ibfk_4` FOREIGN KEY (`subject_id`) REFERENCES `Subjects` (`id`),
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
  `id` varchar(12) NOT NULL,
  `name` varchar(150) DEFAULT NULL,
  `term_type` enum('semestral','quarterly') DEFAULT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(64) NOT NULL,
  `pass_salt` varchar(32) NOT NULL,
  `acc_status` enum('pending','open') DEFAULT 'pending',
  `opened_on` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `Subjects`
--

DROP TABLE IF EXISTS `Subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Subjects` (
  `id` varchar(12) NOT NULL,
  `college_id` varchar(8) DEFAULT NULL,
  `title` varchar(150) NOT NULL,
  `units` int DEFAULT NULL,
  `type` enum('LAB','LEC') DEFAULT NULL,
  `mode` enum('online','f2f','blended') DEFAULT NULL,
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
  `dept_id` varchar(8) DEFAULT NULL,
  `year` int DEFAULT NULL,
  `term` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `dept_id` (`dept_id`),
  CONSTRAINT `terms_ibfk_1` FOREIGN KEY (`dept_id`) REFERENCES `Departments` (`id`)
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

-- Dump completed on 2023-02-23 10:12:35
