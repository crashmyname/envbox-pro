package certificate

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"certification-system/utils"

	"github.com/gin-gonic/gin"
)

type CertificateHandler struct {
	service CertificateService
}

func NewCertificateHandler(service CertificateService) *CertificateHandler {
	return &CertificateHandler{service: service}
}

// GET /api/certificates
func (h *CertificateHandler) GetAll(c *gin.Context) {
	param := utils.GetPaginationParams(c)

	certs, pagination, err := h.service.GetAllCert(param)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat data"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": certs,
		"meta": pagination,
	})
}

// GET /api/certificates/status/:status
func (h *CertificateHandler) GetByStatus(c *gin.Context) {
	status := c.Param("status")

	certs, err := h.service.GetCertByStatus(status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memuat data"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": certs})
}

func (h *CertificateHandler) GetByNIK(c *gin.Context) {
	nik := c.Param("nik")
	certs, err := h.service.GetCertByNIK(string(nik))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "gagal memuat data",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": certs,
	})
}

// PUT /api/certificates/nik/:nik
func (h *CertificateHandler) UpdateByNIK(c *gin.Context) {
	nik := c.Param("nik")

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	certs, _, err := h.service.GetAllCert(utils.PaginationParam{
		Filter: map[string]string{"nik": nik},
		Limit:  1,
	})

	if err == nil && len(certs) > 0 {
		existing := certs[0]

		if name, ok := body["name"].(string); ok && name != "" {
			existing.Name = name
		}
		if reason, ok := body["reason"]; ok {
			switch v := reason.(type) {
			case string:
				existing.Reason = v
			case nil:
				existing.Reason = ""
			}
		}
		if status, ok := body["status"].(string); ok && status != "" {
			existing.Status = status
		}
		existing.UpdatedAt = time.Now()

		if err := h.service.UpdateCert(&existing); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengupdate"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Data berhasil diupdate", "data": existing})
		return
	}

	name, _ := body["name"].(string)
	reason, _ := body["reason"].(string)
	status, _ := body["status"].(string)
	if status == "" {
		status = "Draft Deleted"
	}

	newCert := CertificateApplication{
		NIK:          nik,
		Name:         name,
		Reason:       reason,
		Status:       status,
		TrainingDate: time.Now(),
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := h.service.CreateCert(&newCert); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat data"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Data berhasil dibuat", "data": newCert})
}

// POST /api/certificates (dengan upload file)
func (h *CertificateHandler) Create(c *gin.Context) {
	nik := c.PostForm("nik")
	name := c.PostForm("name")
	certificate := c.PostForm("certificate")
	trainingDate := c.PostForm("training_date")

	if nik == "" || name == "" || certificate == "" || trainingDate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "NIK, Nama, Sertifikasi, dan Tanggal Training wajib diisi"})
		return
	}

	parsedDate, err := time.Parse("2006-01-02", trainingDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format tanggal tidak valid. Gunakan YYYY-MM-DD"})
		return
	}

	uploadDir := "storage/certificates"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat direktori upload"})
		return
	}

	attendanceFile, err := uploadFile(c, "attendance_file", uploadDir, nik)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Gagal upload daftar hadir: %v", err)})
		return
	}

	writtenTestFile, err := uploadFile(c, "written_test_file", uploadDir, nik)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Gagal upload test tulis: %v", err)})
		return
	}

	practiceTestFile, err := uploadFile(c, "practice_test_file", uploadDir, nik)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Gagal upload test praktek: %v", err)})
		return
	}

	eyeTestFile, _ := uploadFile(c, "eye_test_file", uploadDir, nik)

	cert := CertificateApplication{
		NIK:              nik,
		Name:             name,
		Certificate:      certificate,
		TrainingDate:     parsedDate,
		AttachAbsance:    attendanceFile,
		WrittenTestFile:  writtenTestFile,
		PracticeTestFile: practiceTestFile,
		EyeTestFile:      eyeTestFile,
		Status:           "Draft",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	if err := h.service.CreateCert(&cert); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan data"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Pengajuan berhasil dibuat",
		"data":    cert,
	})
}

// PUT /api/certificates/:id
func (h *CertificateHandler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID tidak valid"})
		return
	}

	existing, err := h.service.GetCertByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Data tidak ditemukan"})
		return
	}

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if status, ok := body["status"].(string); ok && status != "" {
		existing.Status = status
	}

	if reason, ok := body["reason"].(string); ok {
		existing.Reason = reason
	}

	if expDateStr, ok := body["exp_date"].(string); ok && expDateStr != "" {
		expDate, err := time.Parse("2006-01-02", expDateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Format exp_date tidak valid. Gunakan YYYY-MM-DD"})
			return
		}
		existing.ExpDate = &expDate
	}

	existing.UpdatedAt = time.Now()

	if err := h.service.UpdateCert(&existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengupdate data"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Data berhasil diupdate",
		"data":    existing,
	})
}

// DELETE /api/certificates/:id
func (h *CertificateHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID tidak valid"})
		return
	}

	if err := h.service.DeleteCert(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menghapus data"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Data berhasil dihapus"})
}

func uploadFile(c *gin.Context, fieldName string, uploadDir string, nik string) (string, error) {
	file, header, err := c.Request.FormFile(fieldName)
	if err != nil {
		return "", fmt.Errorf("file '%s' tidak ditemukan", fieldName)
	}
	defer file.Close()

	// Validasi ukuran (max 10MB)
	if header.Size > 10*1024*1024 {
		return "", fmt.Errorf("ukuran file '%s' terlalu besar (max 10MB)", fieldName)
	}

	// Validasi ekstensi
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowedExts := map[string]bool{
		".pdf": true, ".jpg": true, ".jpeg": true, ".png": true,
		".doc": true, ".docx": true,
	}
	if !allowedExts[ext] {
		return "", fmt.Errorf("format file '%s' tidak didukung", fieldName)
	}

	// rename nama file
	timestamp := time.Now().UnixMilli()
	fileName := fmt.Sprintf("%s_%d_%s%s", nik, timestamp, fieldName, ext)
	filePath := filepath.Join(uploadDir, fileName)

	// Simpan file ke storage
	dst, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("gagal menyimpan file '%s'", fieldName)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		return "", fmt.Errorf("gagal menulis file '%s'", fieldName)
	}

	return filePath, nil
}
