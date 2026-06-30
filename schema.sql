-- JobCoach DB 스키마 (테이블 구조 전체)
CREATE DATABASE IF NOT EXISTS jobcoach_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE jobcoach_db;

DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS ncs_duties;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS ncs_skills;

CREATE TABLE jobs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  jobCode VARCHAR(20) NOT NULL,
  jobName VARCHAR(150) NOT NULL,
  categoryCode VARCHAR(20),
  categoryName VARCHAR(150),
  avgSalary VARCHAR(50),
  outlook VARCHAR(50),
  INDEX idx_jobCode (jobCode)
);

CREATE TABLE ncs_duties (
  id INT PRIMARY KEY AUTO_INCREMENT,
  jobCode VARCHAR(20),
  jobName VARCHAR(150),
  ncsCode VARCHAR(20),
  dutyName VARCHAR(200),
  definition TEXT,
  majorCat VARCHAR(100),
  midCat VARCHAR(100),
  minorCat VARCHAR(100),
  INDEX idx_jobCode (jobCode),
  INDEX idx_ncsCode (ncsCode)
);

CREATE TABLE departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  deptCategory VARCHAR(50),
  detailName VARCHAR(150),
  deptName VARCHAR(150),
  seriesId VARCHAR(20),
  deptId VARCHAR(20)
);

CREATE TABLE ncs_skills (
  id INT PRIMARY KEY AUTO_INCREMENT,
  ncsCode VARCHAR(20),
  unitName VARCHAR(200),
  definition TEXT,
  majorCat VARCHAR(100),
  midCat VARCHAR(100),
  minorCat VARCHAR(100),
  subCat VARCHAR(100),
  knowledge TEXT,
  skill TEXT,
  attitude TEXT,
  keyword VARCHAR(50),
  INDEX idx_keyword (keyword)
);