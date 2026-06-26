import React, { useState } from 'react';
import { Button, Divider, Flex, Form, Radio, Space, Spin, Upload, message } from 'antd';
import { UploadOutlined, InboxOutlined, FileTextOutlined } from '@ant-design/icons';
import { ipcRenderer } from 'electron';
import { useTranslation } from 'react-i18next';

const { Dragger } = Upload;

const MarkdownToPdfDialog: React.FC<{ visible: boolean; onClose: () => void; onConfirm: () => void }> = ({
  visible,
  onClose,
  onConfirm
}) => {
  const [filePath, setFilePath] = useState<string>('');
  const [outputPath, setOutputPath] = useState<string>('');
  const [cssPath, setCssPath] = useState<string>('');
  const [pageSize, setPageSize] = useState<'A4' | 'Letter' | 'Legal'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [loading, setLoading] = useState<boolean>(false);

  const { t } = useTranslation();

  const handleFileChange = (info: any) => {
    const file = info.file;
    if (file && file.path) {
      setFilePath(file.path);
    }
  };

  const handleOutputChange = (info: any) => {
    const file = info.file;
    if (file && file.path) {
      setOutputPath(file.path);
    }
  };

  const handleCssChange = (info: any) => {
    const file = info.file;
    if (file && file.path) {
      setCssPath(file.path);
    }
  };

  const handleConvert = async () => {
    if (!filePath) {
      message.error(t('convert.select_markdown_file_first'));
      return;
    }

    if (!outputPath) {
      message.error(t('convert.select_output_location'));
      return;
    }

    setLoading(true);
    try {
      const result = await ipcRenderer.invoke('markdown-to-pdf:convert', {
        filePath,
        outputPath,
        options: {
          cssPath: cssPath || undefined,
          pageSize,
          orientation
        }
      });

      if (result) {
        message.success(t('convert.conversion_success'));
        // Optionally open the output folder
      } else {
        message.error(t('convert.conversion_failed'));
      }
    } catch (err: any) {
      message.error(`Conversion failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="markdown-to-pdf-dialog">
      <div className="dialog-header">
        <h3>{t('convert.markdown_to_pdf')}</h3>
      </div>
      <div className="dialog-body">
        <Form layout="vertical">
          <Form.Item
            label={t('convert.select_markdown_file')}
            help={t('convert.select_markdown_file_help')}
          >
            <Dragger
              showUploadList={false}
              accept=".md,.markdown"
              onChange={handleFileChange}
              disabled={loading}
            >
              <p className="ant-upload-drag-icon">
                <FileTextOutlined />
              </p>
              <p className="ant-upload-text">{t('common.click_or_drag_file')}</p>
              <p className="ant-upload-hint">{t('common.supported_format', { format: '.md, .markdown' })}</p>
            </Dragger>
          </Form.Item>

          <Form.Item
            label={t('convert.output_file')}
            help={t('convert.output_file_help')}
          >
            <Dragger
              showUploadList={false}
              accept=".*"
              directory
              onChange={handleOutputChange}
              disabled={loading}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">{t('common.select_output_folder')}</p>
            </Dragger>
          </Form.Item>

          <Form.Item
            label={t('convert.custom_css')}
            help={t('convert.custom_css_help')}
          >
            <Dragger
              showUploadList={false}
              accept=".css"
              onChange={handleCssChange}
              disabled={loading}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">{t('common.select_css_file_optional')}</p>
              <p className="ant-upload-hint">{t('common.supported_format', { format: '.css' })}</p>
            </Dragger>
          </Form.Item>

          <Form.Item label={t('common.page_size')}>
            <Radio.Group
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as 'A4' | 'Letter' | 'Legal')}
              disabled={loading}
            >
              <Radio.Button value="A4">A4</Radio.Button>
              <Radio.Button value="Letter">Letter</Radio.Button>
              <Radio.Button value="Legal">Legal</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item label={t('common.orientation')}>
            <Radio.Group
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
              disabled={loading}
            >
              <Radio.Button value="portrait">{t('common.portrait')}</Radio.Button>
              <Radio.Button value="landscape">{t('common.landscape')}</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Form>

        <Divider />

        <Flex align="middle" justify="space-between">
          <Spin spinning={loading} size="small">
            <Button
              type="primary"
              onClick={handleConvert}
              loading={loading}
              disabled={!filePath || !outputPath}
            >
              {t('common.convert')}
            </Button>
          </Spin>

          <Space>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button onClick={onConfirm} disabled={!filePath || !outputPath}>
              {t('common.confirm_and_close')}
            </Button>
          </Space>
        </Flex>
      </div>
    </div>
  );
};

export default MarkdownToPdfDialog;