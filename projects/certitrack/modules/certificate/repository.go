package certificate

import (
	"certification-system/utils"

	"gorm.io/gorm"
)

type CertificateRepository interface {
	FindAll(params utils.PaginationParam) ([]CertificateApplication, *utils.Pagination, error)
	FindByID(id uint) (CertificateApplication, error)
	FindByNIK(nik string) (CertificateApplication, error)
	GetByStatus(status string) ([]CertificateApplication, error)
	Create(cert *CertificateApplication) error
	Update(cert *CertificateApplication) error
	Delete(id uint) error
}

type certificateRepository struct {
	db *gorm.DB
}

func NewCertificateRepository(db *gorm.DB) CertificateRepository {
	return &certificateRepository{db: db}
}

func (r *certificateRepository) FindAll(param utils.PaginationParam) ([]CertificateApplication, *utils.Pagination, error) {
	var cert []CertificateApplication

	query := r.db.Model(&CertificateApplication{})

	if param.Search != "" {
		query = query.Where(
			"nik LIKE ? OR name LIKE ? OR certificate LIKE ?",
			"%"+param.Search+"%",
			"%"+param.Search+"%",
			"%"+param.Search+"%",
		)
	}

	pagination, err := utils.Paginate(query, param, &cert)
	if err != nil {
		return nil, nil, err
	}

	return cert, pagination, nil
}

func (r *certificateRepository) GetByStatus(status string) ([]CertificateApplication, error) {
	var cert []CertificateApplication
	err := r.db.Where("status = ?", status).Find(&cert).Error
	return cert, err
}

func (r *certificateRepository) FindByID(id uint) (CertificateApplication, error) {
	var cert CertificateApplication
	err := r.db.First(&cert, id).Error
	return cert, err
}

func (r *certificateRepository) FindByNIK(nik string) (CertificateApplication, error) {
	var cert CertificateApplication
	err := r.db.Where("nik = ?", nik).First(&cert).Error
	return cert, err
}

func (r *certificateRepository) Create(cert *CertificateApplication) error {
	return r.db.Create(cert).Error
}

func (r *certificateRepository) Update(cert *CertificateApplication) error {
	return r.db.Save(cert).Error
}

func (r *certificateRepository) Delete(id uint) error {
	return r.db.Delete(&CertificateApplication{}, id).Error
}
