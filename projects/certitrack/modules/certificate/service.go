package certificate

import (
	"certification-system/utils"
	"log"
	"os"
)

type CertificateService interface {
	GetAllCert(param utils.PaginationParam) ([]CertificateApplication, *utils.Pagination, error)
	GetCertByID(id uint) (CertificateApplication, error)
	GetCertByNIK(nik string) (CertificateApplication, error)
	GetCertByStatus(status string) ([]CertificateApplication, error)
	CreateCert(cert *CertificateApplication) error
	UpdateCert(cert *CertificateApplication) error
	DeleteCert(id uint) error
}

type certificateService struct {
	repo CertificateRepository
}

func NewCertificateService(repo CertificateRepository) CertificateService {
	return &certificateService{repo: repo}
}

func (s *certificateService) GetAllCert(param utils.PaginationParam) ([]CertificateApplication, *utils.Pagination, error) {
	return s.repo.FindAll(param)
}

func (s *certificateService) GetCertByStatus(status string) ([]CertificateApplication, error) {
	return s.repo.GetByStatus(string(status))
}

func (s *certificateService) GetCertByID(id uint) (CertificateApplication, error) {
	return s.repo.FindByID(uint(id))
}

func (s *certificateService) GetCertByNIK(nik string) (CertificateApplication, error) {
	return s.repo.FindByNIK(string(nik))
}

func (s *certificateService) CreateCert(cert *CertificateApplication) error {
	return s.repo.Create(cert)
}

func (s *certificateService) UpdateCert(cert *CertificateApplication) error {
	return s.repo.Update(cert)
}

func (s *certificateService) DeleteCert(id uint) error {
	cert, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}

	files := []string{
		cert.AttachAbsance,
		cert.WrittenTestFile,
		cert.PracticeTestFile,
		cert.EyeTestFile,
	}

	for _, filePath := range files {
		if filePath != "" {
			if err := os.Remove(filePath); err != nil {
				log.Printf("Gagal hapus file %s: %v", filePath, err)
			} else {
				log.Printf("File dihapus: %s", filePath)
			}
		}
	}
	return s.repo.Delete(uint(id))
}
