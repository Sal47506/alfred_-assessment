import { ChangeEvent, useEffect, useState } from "react";

const ImageUpload = () => {
    const [image, setImage] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);

    const onChangeFile = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImage(file);
        setPreview(URL.createObjectURL(file));
    }

    useEffect(() => {
        if (!image) {
            setPreview(null);
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setPreview(reader.result as string);
        }
        reader.readAsDataURL(image);

        return () => {
            reader.abort();
        }

    }, [image]);

    return (
        <div>
            <input type="file" accept="image/*" onChange={onChangeFile} />
            {preview && <img src={preview} alt="preview" />}
        </div>
    );

}

export default ImageUpload;